import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { HttpStatus, Injectable, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import {
  AuditAction,
  AuditEntityType,
  SystemActor,
} from '@/audit/audit-action.enum';
import { AuditService } from '@/audit/audit.service';
import type { AccessTokenPayload } from '@/auth/auth-user';
import { TokenResponseDto } from '@/auth/dto/auth.dto';
import { hashPassword, verifyPassword } from '@/auth/password';
import { RefreshToken } from '@/auth/refresh-token.entity';
import { AppException } from '@/common/errors/app.exception';
import { ErrorCode } from '@/common/errors/error-codes';
import { maskEmail } from '@/common/masking/masking';
import type { Env } from '@/config/env.schema';
import { User } from '@/users/user.entity';
import { UsersService } from '@/users/users.service';

const DAY_SECONDS = 24 * 60 * 60;

/** SHA-256 of a refresh token, hex. Only this is stored. */
const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

const invalidCredentials = () =>
  new AppException(
    HttpStatus.UNAUTHORIZED,
    ErrorCode.INVALID_CREDENTIALS,
    // Same message for unknown email, wrong password and inactive account.
    'Invalid email or password',
  );

const invalidRefreshToken = () =>
  new AppException(
    HttpStatus.UNAUTHORIZED,
    ErrorCode.INVALID_REFRESH_TOKEN,
    'Invalid refresh token',
  );

type RefreshOutcome = { ok: true; tokens: TokenResponseDto } | { ok: false };

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly accessTtlSeconds: number;
  private readonly refreshTtlSeconds: number;
  private readonly bcryptRounds: number;
  // A real bcrypt hash of a random value. Unknown emails are checked against it,
  // so "no such user" takes as long as "wrong password" (no timing leak).
  private dummyHash = '';

  constructor(
    config: ConfigService<Env, true>,
    private readonly dataSource: DataSource,
    private readonly jwt: JwtService,
    private readonly users: UsersService,
    private readonly audit: AuditService,
  ) {
    this.accessTtlSeconds = config.get('JWT_ACCESS_TTL_SECONDS', {
      infer: true,
    });
    this.refreshTtlSeconds =
      config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true }) * DAY_SECONDS;
    this.bcryptRounds = config.get('BCRYPT_ROUNDS', { infer: true });
  }

  async onModuleInit(): Promise<void> {
    this.dummyHash = await hashPassword(
      randomBytes(16).toString('hex'),
      this.bcryptRounds,
    );
  }

  async login(email: string, password: string): Promise<TokenResponseDto> {
    const user = await this.users.findByEmailWithPasswordHash(email);
    // Always run bcrypt, even for an unknown email.
    const passwordMatches = await verifyPassword(
      password,
      user?.passwordHash ?? this.dummyHash,
    );

    if (!user || !user.isActive || !passwordMatches) {
      const reason = !user
        ? 'UNKNOWN_EMAIL'
        : !user.isActive
          ? 'INACTIVE_USER'
          : 'WRONG_PASSWORD';
      await this.dataSource.transaction((manager) =>
        this.audit.record(manager, {
          actor: SystemActor.ANONYMOUS,
          action: AuditAction.LOGIN_FAILED,
          entityType: AuditEntityType.USER,
          entityId: user?.id ?? null,
          // The reason is for the audit trail only; the caller always sees the same message.
          metadata: { email: maskEmail(email), reason },
        }),
      );
      throw invalidCredentials();
    }

    return this.dataSource.transaction(async (manager) => {
      // A new login starts a new token family.
      const { response } = await this.issueTokens(manager, user, randomUUID());
      await this.audit.record(manager, {
        actor: { id: user.id, role: user.role },
        action: AuditAction.LOGIN_SUCCEEDED,
        entityType: AuditEntityType.USER,
        entityId: user.id,
      });
      return response;
    });
  }

  /**
   * Rotation with reuse detection. The token row is locked, so two refreshes
   * with the same token run one after the other: the second one sees a used
   * token and is treated as reuse.
   */
  async refresh(refreshToken: string): Promise<TokenResponseDto> {
    const outcome = await this.dataSource.transaction(
      async (manager): Promise<RefreshOutcome> => {
        const current = await manager.findOne(RefreshToken, {
          where: { tokenHash: hashToken(refreshToken) },
          lock: { mode: 'pessimistic_write' },
        });
        if (!current) {
          return { ok: false };
        }

        if (current.revokedAt) {
          // replacedById set = this token was already exchanged once. Seeing it
          // again means someone has a copy: end the whole session.
          // (Without replacedById it was revoked by logout or an earlier reuse; just refuse.)
          if (current.replacedById) {
            await this.revokeFamily(manager, current.familyId);
            await this.audit.record(manager, {
              actor: SystemActor.ANONYMOUS,
              action: AuditAction.REFRESH_TOKEN_REUSE_DETECTED,
              entityType: AuditEntityType.USER,
              entityId: current.userId,
              metadata: { familyId: current.familyId },
            });
          }
          return { ok: false };
        }

        if (current.expiresAt.getTime() <= Date.now()) {
          return { ok: false };
        }

        const user = await this.users.findById(current.userId, manager);
        if (!user || !user.isActive) {
          await this.revokeFamily(manager, current.familyId);
          return { ok: false };
        }

        const tokens = await this.issueTokens(manager, user, current.familyId);
        await manager.update(
          RefreshToken,
          { id: current.id },
          { revokedAt: new Date(), replacedById: tokens.refreshTokenId },
        );
        return { ok: true, tokens: tokens.response };
      },
    );

    // Thrown after the transaction, so a detected reuse stays revoked.
    if (!outcome.ok) {
      throw invalidRefreshToken();
    }
    return outcome.tokens;
  }

  /** Ends the session the token belongs to. Always succeeds, so it reveals nothing. */
  async logout(refreshToken: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const token = await manager.findOne(RefreshToken, {
        where: { tokenHash: hashToken(refreshToken) },
        relations: { user: true },
      });
      if (!token?.user) {
        return;
      }

      await this.revokeFamily(manager, token.familyId);
      await this.audit.record(manager, {
        actor: { id: token.user.id, role: token.user.role },
        action: AuditAction.LOGOUT,
        entityType: AuditEntityType.USER,
        entityId: token.user.id,
      });
    });
  }

  /** A new access token plus a new refresh token in the given family. */
  private async issueTokens(
    manager: EntityManager,
    user: User,
    familyId: string,
  ): Promise<{ response: TokenResponseDto; refreshTokenId: string }> {
    const payload: AccessTokenPayload = { sub: user.id, role: user.role };
    const accessToken = await this.jwt.signAsync(payload);

    // 32 random bytes: unguessable, and only its hash is stored.
    const refreshToken = randomBytes(32).toString('base64url');
    const row = await manager.save(
      manager.create(RefreshToken, {
        userId: user.id,
        familyId,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + this.refreshTtlSeconds * 1000),
        revokedAt: null,
        replacedById: null,
      }),
    );

    const response: TokenResponseDto = {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: this.accessTtlSeconds,
      refreshToken,
      refreshExpiresIn: this.refreshTtlSeconds,
      user: { id: user.id, fullName: user.fullName, role: user.role },
    };
    return { response, refreshTokenId: row.id };
  }

  private async revokeFamily(
    manager: EntityManager,
    familyId: string,
  ): Promise<void> {
    await manager.update(
      RefreshToken,
      { familyId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }
}
