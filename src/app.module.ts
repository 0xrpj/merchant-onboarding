import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { envSchema } from '@/config/env.schema';
import { HealthModule } from '@/health/health.module';

/**
 * Root module. Each feature (auth, applications, risk, audit, ...) is its own module
 * and gets plugged in here.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      // Available in every module without importing ConfigModule again.
      isGlobal: true,
      // Reads values once and keeps them in memory.
      cache: true,
      // Checked at startup. Any problem stops the app with a list of what is wrong.
      validationSchema: envSchema,
    }),
    HealthModule,
  ],
})
export class AppModule {}