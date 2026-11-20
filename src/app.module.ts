import { Module } from '@nestjs/common';
import { ApplicationsModule } from '@/applications/applications.module';
import { AuditModule } from '@/audit/audit.module';
import { AuthModule } from '@/auth/auth.module';
import { appConfigModule } from '@/config/config.module';
import { DatabaseModule } from '@/database/database.module';
import { HealthModule } from '@/health/health.module';
import { UsersModule } from '@/users/users.module';

/**
 * Root module of the API process. Each feature is its own module and gets plugged in here.
 */
@Module({
  imports: [
    appConfigModule,
    DatabaseModule,
    HealthModule,
    UsersModule,
    AuditModule,
    AuthModule,
    ApplicationsModule,
  ],
})
export class AppModule {}
