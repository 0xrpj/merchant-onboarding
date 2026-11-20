import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { JobsOptions, Queue } from 'bullmq';
import { withTimeout } from '@/common/utils/with-timeout';
import type { Env } from '@/config/env.schema';
import {
  RISK_JOB,
  RISK_QUEUE,
  type RiskJobData,
} from '@/risk/risk-queue.constants';

const DAY_SECONDS = 24 * 60 * 60;
// If Redis doesn't answer in time, the caller marks the risk check FAILED
// (an ADMIN can retry it) instead of making the user wait.
const ENQUEUE_TIMEOUT_MS = 3_000;

/** The producer side: the API puts risk jobs on the queue. */
@Injectable()
export class RiskQueueService {
  private readonly jobOptions: JobsOptions;

  constructor(
    @InjectQueue(RISK_QUEUE) private readonly queue: Queue<RiskJobData>,
    config: ConfigService<Env, true>,
  ) {
    this.jobOptions = {
      // Total tries, including the first one.
      attempts: config.get('RISK_JOB_ATTEMPTS', { infer: true }),
      // Waits 2s, 4s, 8s, ... between tries. Jitter spreads retries out a little,
      // so many failed jobs don't all hit the provider again at the same moment.
      backoff: {
        type: 'exponential',
        delay: config.get('RISK_JOB_BACKOFF_MS', { infer: true }),
        jitter: 0.2,
      },
      // Redis isn't a database: finished jobs are cleaned up. Failed ones are kept
      // longer for investigation. The real record is in Postgres.
      removeOnComplete: { age: DAY_SECONDS },
      removeOnFail: { age: 7 * DAY_SECONDS },
    };
  }

  async enqueue(data: RiskJobData, jobId: string): Promise<void> {
    await withTimeout(
      this.queue.add(RISK_JOB, data, { ...this.jobOptions, jobId }),
      ENQUEUE_TIMEOUT_MS,
      'Timed out adding the risk job to the queue',
    );
  }

  /**
   * For the health check: resolves if Redis answers within `timeoutMs`.
   * Counting waiting jobs is a cheap real round trip through BullMQ.
   */
  async ping(timeoutMs: number): Promise<number> {
    return withTimeout(this.queue.count(), timeoutMs, 'Redis did not answer');
  }
}
