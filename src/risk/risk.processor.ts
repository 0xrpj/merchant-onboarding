import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Job } from 'bullmq';
import type { Env } from '@/config/env.schema';
import {
  RiskAssessmentService,
  type RiskRunOutcome,
} from '@/risk/risk-assessment.service';
import { RISK_QUEUE, type RiskJobData } from '@/risk/risk-queue.constants';

/**
 * The BullMQ consumer: takes jobs off the risk queue and runs them.
 * Retries and backoff are BullMQ's job (see RiskQueueService); this class
 * only says whether the current try is the last one.
 */
@Processor(RISK_QUEUE)
export class RiskProcessor
  extends WorkerHost
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(RiskProcessor.name);

  constructor(
    private readonly assessments: RiskAssessmentService,
    private readonly config: ConfigService<Env, true>,
  ) {
    super();
  }

  onApplicationBootstrap(): void {
    // How many jobs this process runs at once. Set here because the
    // @Processor() decorator can't read config.
    this.worker.concurrency = this.config.get('RISK_WORKER_CONCURRENCY', {
      infer: true,
    });
  }

  async process(job: Job<RiskJobData>): Promise<RiskRunOutcome> {
    const attempts = job.opts.attempts ?? 1;
    // attemptsMade counts the tries that already failed, so this is try number attemptsMade + 1.
    const attempt = job.attemptsMade + 1;
    const outcome = await this.assessments.run(job.data, attempt >= attempts);
    this.logger.log(
      `Risk job ${job.id}: ${outcome} (attempt ${attempt} of ${attempts})`,
    );
    return outcome;
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<RiskJobData> | undefined, error: Error): void {
    // Only our job ID and a safe message: never the job's personal data.
    this.logger.warn(
      `Risk job ${job?.id ?? 'unknown'} attempt failed: ${error.name}`,
    );
  }
}
