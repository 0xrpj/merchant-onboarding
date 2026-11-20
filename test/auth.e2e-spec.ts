import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AuditLog } from '@/audit/audit-log.entity';
import { RefreshToken } from '@/auth/refresh-token.entity';
import type { Env } from '@/config/env.schema';
import { User } from '@/users/user.entity';
import { api, createTestContext, type TestContext } from './utils/test-app';

type Tokens = { accessToken: string; refreshToken: string };

describe('Authentication (e2e)', () => {
  let ctx: TestContext;

  const post = (path: string, body: object) =>
    request(ctx.app.getHttpServer()).post(`/api/v1${path}`).send(body);
  const loginAs = async (email: string): Promise<Tokens> =>
    (await post('/auth/login', { email, password: ctx.password }).expect(200))
      .body as Tokens;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(() => ctx.app.close());

  describe('login', () => {
    it('returns an access token, a refresh token and the user, never the password hash', async () => {
      const res = await post('/auth/login', {
        email: 'SITA@example.com', // emails are case-insensitive
        password: ctx.password,
      }).expect(200);

      expect(res.body).toMatchObject({
        accessToken: expect.any(String),
        tokenType: 'Bearer',
        expiresIn: 900,
        refreshToken: expect.any(String),
        user: { id: ctx.staff.sita.id, fullName: 'Sita Sales', role: 'SALES' },
      });
      expect(JSON.stringify(res.body)).not.toMatch(/password/i);
    });

    it.each([
      ['a wrong password', 'sita@example.com', 'wrong-password-123'],
      ['an unknown email', 'nobody@example.com', 'wrong-password-123'],
      ['an inactive account', 'formerreviewer@example.com', undefined],
    ])('gives the same 401 for %s', async (_label, email, password) => {
      const res = await post('/auth/login', {
        email,
        password: password ?? ctx.password,
      }).expect(401);

      expect(res.body).toMatchObject({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
    });

    it('records failed logins with a masked email and no password', async () => {
      await post('/auth/login', {
        email: 'sita@example.com',
        password: 'wrong-password-456',
      });

      const log = await ctx.dataSource.getRepository(AuditLog).findOneOrFail({
        where: { action: 'LOGIN_FAILED' as AuditLog['action'] },
        order: { createdAt: 'DESC' },
      });
      expect(log.metadata).toEqual({
        email: 's***@example.com',
        reason: 'WRONG_PASSWORD',
      });
      expect(JSON.stringify(log)).not.toContain('wrong-password-456');
    });

    it('validates the body (400)', async () => {
      const res = await post('/auth/login', { email: 'not-an-email' }).expect(
        400,
      );
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('access token', () => {
    it('GET /auth/me returns the logged-in user', async () => {
      const res = await api(ctx, 'ram').get('/auth/me').expect(200);
      expect(res.body).toMatchObject({
        id: ctx.staff.ram.id,
        role: 'REVIEWER',
        isActive: true,
      });
    });

    it.each([
      ['no token', undefined],
      ['a malformed token', 'Bearer not-a-jwt'],
      ['the wrong scheme', 'Basic abc'],
    ])('401 with %s', async (_label, header) => {
      const req = request(ctx.app.getHttpServer()).get('/api/v1/auth/me');
      const res = await (
        header ? req.set('Authorization', header) : req
      ).expect(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    it('401 for a token signed with another secret', async () => {
      const forged = new JwtService().sign(
        { sub: ctx.staff.maya.id, role: 'ADMIN' },
        {
          secret: 'not-the-real-secret-not-the-real-secret',
          issuer: 'merchant-onboarding-api',
          audience: 'merchant-onboarding-api',
        },
      );
      await request(ctx.app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${forged}`)
        .expect(401);
    });

    it('401 for an expired token', async () => {
      const secret = ctx.app
        .get(ConfigService<Env, true>)
        .get('JWT_ACCESS_SECRET');
      const expired = new JwtService().sign(
        { sub: ctx.staff.maya.id, role: 'ADMIN' },
        {
          secret,
          issuer: 'merchant-onboarding-api',
          audience: 'merchant-onboarding-api',
          expiresIn: -10,
        },
      );
      await request(ctx.app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${expired}`)
        .expect(401);
    });

    it('the role comes from the database, not the token: a role in the token is ignored', async () => {
      const secret = ctx.app
        .get(ConfigService<Env, true>)
        .get('JWT_ACCESS_SECRET');
      // Correctly signed, but claims ADMIN for a SALES user.
      const token = new JwtService().sign(
        { sub: ctx.staff.hari.id, role: 'ADMIN' },
        {
          secret,
          issuer: 'merchant-onboarding-api',
          audience: 'merchant-onboarding-api',
        },
      );
      await request(ctx.app.getHttpServer())
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('a deactivated user is locked out at once, even with a valid token', async () => {
      const { accessToken } = await loginAs('gita@example.com');
      await ctx.dataSource
        .getRepository(User)
        .update({ id: ctx.staff.gita.id }, { isActive: false });

      await request(ctx.app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(401);
      await ctx.dataSource
        .getRepository(User)
        .update({ id: ctx.staff.gita.id }, { isActive: true });
    });
  });

  describe('refresh tokens', () => {
    it('are stored only as SHA-256 hashes', async () => {
      const { refreshToken } = await loginAs('hari@example.com');

      const rows = await ctx.dataSource.getRepository(RefreshToken).find();
      expect(rows.some((row) => row.tokenHash === refreshToken)).toBe(false);
      expect(rows.every((row) => /^[0-9a-f]{64}$/.test(row.tokenHash))).toBe(
        true,
      );
    });

    it('rotate: each refresh gives a new pair, and the old refresh token stops working', async () => {
      const first = await loginAs('hari@example.com');

      const second = (
        await post('/auth/refresh', {
          refreshToken: first.refreshToken,
        }).expect(200)
      ).body as Tokens;
      expect(second.refreshToken).not.toBe(first.refreshToken);
      await request(ctx.app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${second.accessToken}`)
        .expect(200);

      const reuse = await post('/auth/refresh', {
        refreshToken: first.refreshToken,
      }).expect(401);
      expect(reuse.body.code).toBe('INVALID_REFRESH_TOKEN');
    });

    it('reuse detection: replaying a used token ends the whole session', async () => {
      const first = await loginAs('hari@example.com');
      const second = (
        await post('/auth/refresh', {
          refreshToken: first.refreshToken,
        }).expect(200)
      ).body as Tokens;

      // An attacker replays the stolen, already-used token...
      await post('/auth/refresh', { refreshToken: first.refreshToken }).expect(
        401,
      );
      // ...so the legitimate newer token is revoked too.
      await post('/auth/refresh', { refreshToken: second.refreshToken }).expect(
        401,
      );

      const alerts = await ctx.dataSource.getRepository(AuditLog).findBy({
        action: 'REFRESH_TOKEN_REUSE_DETECTED' as AuditLog['action'],
        entityId: ctx.staff.hari.id,
      });
      expect(alerts.length).toBeGreaterThanOrEqual(1);
    });

    it('logout revokes the session (204), and says nothing about unknown tokens', async () => {
      const { refreshToken } = await loginAs('hari@example.com');

      await post('/auth/logout', { refreshToken }).expect(204);
      await post('/auth/refresh', { refreshToken }).expect(401);
      await post('/auth/logout', { refreshToken: 'never-issued' }).expect(204);
    });

    it('an unknown refresh token is 401', async () => {
      await post('/auth/refresh', { refreshToken: 'never-issued' }).expect(401);
    });
  });
});

describe('Login rate limit (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    // A fresh app, so earlier logins don't count against the limit.
    ctx = await createTestContext();
  });

  afterAll(() => ctx.app.close());

  it('answers 429 RATE_LIMITED after AUTH_RATE_LIMIT attempts per window', async () => {
    const limit = ctx.app.get(ConfigService<Env, true>).get('AUTH_RATE_LIMIT');
    const attempt = () =>
      request(ctx.app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'sita@example.com', password: 'wrong-password-123' });

    // createTestContext already logged in 5 users from this IP.
    const statuses: number[] = [];
    for (let i = 0; i < limit; i += 1) {
      statuses.push((await attempt()).status);
    }
    const blocked = await attempt();

    expect(statuses).toContain(401);
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('RATE_LIMITED');
  });
});
