import { Module } from '@nestjs/common';
import { HealthModule } from '@/health/health.module';

/**
 * Root module. Each feature (auth, applications, risk, audit, ...) is its own module
 * and gets plugged in here.
 */
@Module({
  imports: [HealthModule],
})
export class AppModule {}
