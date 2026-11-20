import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from '@/health/health.controller';
import { RedisHealthIndicator } from '@/health/redis.health';
import { RiskQueueModule } from '@/risk/risk-queue.module';

@Module({
  imports: [TerminusModule, RiskQueueModule],
  controllers: [HealthController],
  providers: [RedisHealthIndicator],
})
export class HealthModule {}
