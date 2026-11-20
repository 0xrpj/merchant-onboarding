import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '@/audit/audit.module';
import { AuthController } from '@/auth/auth.controller';
import { AuthService } from '@/auth/auth.service';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/auth/guards/roles.guard';
import { RefreshToken } from '@/auth/refresh-token.entity';
import type { Env } from '@/config/env.schema';
import { UsersModule } from '@/users/users.module';

const TOKEN_ISSUER = 'merchant-onboarding-api';

@Module({
  imports: [
    TypeOrmModule.forFeature([RefreshToken]),
    UsersModule,
    AuditModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_ACCESS_SECRET', { infer: true }),
        signOptions: {
          expiresIn: config.get('JWT_ACCESS_TTL_SECONDS', { infer: true }),
          issuer: TOKEN_ISSUER,
          audience: TOKEN_ISSUER,
        },
        // Only accept what we sign: HS256, our issuer and audience.
        verifyOptions: {
          algorithms: ['HS256'],
          issuer: TOKEN_ISSUER,
          audience: TOKEN_ISSUER,
        },
      }),
    }),
    // Used by login and refresh only (see @UseGuards(ThrottlerGuard) in AuthController).
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        throttlers: [
          {
            name: 'auth',
            ttl: config.get('AUTH_RATE_WINDOW_SECONDS', { infer: true }) * 1000,
            limit: config.get('AUTH_RATE_LIMIT', { infer: true }),
          },
        ],
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    // Global guards, in this order: who are you (401), then may your role do this (403).
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthModule {}
