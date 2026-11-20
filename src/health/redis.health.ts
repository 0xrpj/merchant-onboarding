import { Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import { RiskQueueService } from '@/risk/risk-queue.service';

/** Redis is up if the risk queue answers within the timeout. */
@Injectable()
export class RedisHealthIndicator {
  constructor(
    private readonly health: HealthIndicatorService,
    private readonly riskQueue: RiskQueueService,
  ) {}

  async check(key: string, timeoutMs: number) {
    const indicator = this.health.check(key);
    try {
      await this.riskQueue.ping(timeoutMs);
      return indicator.up();
    } catch {
      return indicator.down({ message: 'Redis did not answer' });
    }
  }
}
