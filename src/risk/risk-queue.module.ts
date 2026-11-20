import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '@/config/env.schema';
import { RISK_QUEUE } from '@/risk/risk-queue.constants';
import { RiskQueueService } from '@/risk/risk-queue.service';

/**
 * The connection to Redis and the risk queue. Used by the API (to add jobs and
 * for the health check) and by the worker (to process them).
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        connection: {
          host: config.get('REDIS_HOST', { infer: true }),
          port: config.get('REDIS_PORT', { infer: true }),
          db: config.get('REDIS_DB', { infer: true }),
          // Required by BullMQ workers: keep retrying commands while Redis reconnects
          // instead of failing them after a fixed number of tries.
          maxRetriesPerRequest: null,
        },
      }),
    }),
    BullModule.registerQueue({ name: RISK_QUEUE }),
  ],
  providers: [RiskQueueService],
  exports: [RiskQueueService, BullModule],
})
export class RiskQueueModule {}
