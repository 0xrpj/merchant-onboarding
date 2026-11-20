import { Module } from '@nestjs/common';
import { ConditionalModule } from '@nestjs/config';
import { ApplicationsModule } from '@/applications/applications.module';
import { AuditModule } from '@/audit/audit.module';
import { AuthModule } from '@/auth/auth.module';
import { appConfigModule } from '@/config/config.module';
import { DatabaseModule } from '@/database/database.module';
import { HealthModule } from '@/health/health.module';
import { RiskWorkerModule } from '@/risk/risk-worker.module';
import { UsersModule } from '@/users/users.module';

/**
 * Root module of the API process. Each feature is its own module and gets plugged in here.
 * The worker process has its own root module (WorkerModule).
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
    // The risk worker runs inside the API unless RUN_RISK_WORKER=false
    // (then a separate `npm run start:worker` process does the jobs).
    ConditionalModule.registerWhen(
      RiskWorkerModule,
      (env) => env.RUN_RISK_WORKER !== 'false',
    ),
  ],
})
export class AppModule {}
