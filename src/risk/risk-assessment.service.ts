import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  ApplicationStatus,
  RiskStatus,
} from '@/applications/application.enums';
import { canPerform } from '@/applications/domain/application-transitions';
import { MerchantApplication } from '@/applications/entities/merchant-application.entity';
import { MerchantOwner } from '@/applications/entities/merchant-owner.entity';
import {
  AuditAction,
  AuditEntityType,
  SystemActor,
} from '@/audit/audit-action.enum';
import { AuditService } from '@/audit/audit.service';
import { TimeoutError, withTimeout } from '@/common/utils/with-timeout';
import { FieldEncryptionService } from '@/crypto/field-encryption.service';
import {
  KYB_PROVIDER,
  type KybProvider,
  KybProviderError,
  type KybRequest,
  type KybResult,
} from '@/risk/kyb/kyb-provider';
import { RiskAssessmentStatus } from '@/risk/risk-assessment-status.enum';
import { RiskAssessment } from '@/risk/risk-assessment.entity';
import type { RiskJobData } from '@/risk/risk-queue.constants';

/** Give up on one provider call after this long (counts as a failed attempt). */
const PROVIDER_TIMEOUT_MS = 10_000;

/**
 * COMPLETED: result saved, application moved to IN_REVIEW.
 * DUPLICATE: this submission already has a result; nothing done.
 * STALE: the application moved on (resubmitted, or waiting for a manual retry); nothing done.
 */
export type RiskRunOutcome = 'COMPLETED' | 'DUPLICATE' | 'STALE';

/** Only our own error messages are stored. Anything else could contain data we don't control. */
const safeErrorMessage = (error: unknown): string =>
  error instanceof KybProviderError || error instanceof TimeoutError
    ? error.message.slice(0, 200)
    : 'Unexpected error during the risk check';

/**
 * The worker's logic for one risk check. Safe to run twice for the same
 * submission (idempotent): the second run changes nothing.
 */
@Injectable()
export class RiskAssessmentService {
  private readonly logger = new Logger(RiskAssessmentService.name);

  constructor(
    private readonly dataSource: DataSource,
    @Inject(KYB_PROVIDER) private readonly provider: KybProvider,
    private readonly encryption: FieldEncryptionService,
    private readonly audit: AuditService,
  ) {}

  /**
   * One attempt. Throws when the provider fails, which makes BullMQ retry
   * after a backoff. On the last attempt the failure is recorded as FAILED.
   */
  async run(job: RiskJobData, isLastAttempt: boolean): Promise<RiskRunOutcome> {
    const { applicationId, submissionNumber } = job;

    // 1. Worker-level idempotency: is there still something to do?
    const assessment = await this.dataSource
      .getRepository(RiskAssessment)
      .findOne({ where: { applicationId, submissionNumber } });
    if (assessment?.status === RiskAssessmentStatus.COMPLETED) {
      return 'DUPLICATE';
    }
    const app = await this.dataSource
      .getRepository(MerchantApplication)
      .findOne({
        where: { id: applicationId },
        relations: { owners: true },
      });
    if (
      !app ||
      !assessment ||
      !this.isCurrent(app, assessment, submissionNumber)
    ) {
      return 'STALE';
    }

    // 2. Call the provider OUTSIDE any transaction: it can take seconds, and
    //    we must not hold a row lock (or a database connection) that long.
    let result: KybResult;
    try {
      result = await withTimeout(
        this.provider.check(this.buildRequest(app, app.owners ?? [])),
        PROVIDER_TIMEOUT_MS,
        'KYB provider timed out',
      );
    } catch (error) {
      const message = safeErrorMessage(error);
      await this.recordFailedAttempt(job, message, isLastAttempt);
      throw error instanceof Error ? error : new Error(message);
    }

    // 3. Save under the row lock, checking again that nothing moved on meanwhile.
    return this.saveResult(job, result);
  }

  private buildRequest(
    app: MerchantApplication,
    owners: MerchantOwner[],
  ): KybRequest {
    return {
      businessName: app.businessName,
      legalBusinessName: app.legalBusinessName,
      registrationNumber: app.registrationNumber,
      businessType: app.businessType,
      industry: app.industry,
      expectedMonthlyVolumeMinor: app.expectedMonthlyVolumeMinor,
      averageTransactionMinor: app.averageTransactionMinor,
      channels: app.processingChannels,
      owners: owners.map((owner) => ({
        fullName: owner.fullName,
        // The only place a national ID is ever decrypted.
        nationalId: this.encryption.decrypt(owner.nationalIdEncrypted),
        ownershipPercent: owner.ownershipPercent,
      })),
    };
  }

  /** Still SUBMITTED, still on this submission, and the check still PENDING. */
  private isCurrent(
    app: MerchantApplication,
    assessment: RiskAssessment,
    submissionNumber: number,
  ): boolean {
    return (
      canPerform('completeRisk', app.status) &&
      app.submissionCount === submissionNumber &&
      assessment.status === RiskAssessmentStatus.PENDING
    );
  }

  /** Locks the application row first, then the assessment (same order everywhere, so no deadlocks). */
  private async lockBoth(
    manager: EntityManager,
    { applicationId, submissionNumber }: RiskJobData,
  ): Promise<{
    app: MerchantApplication | null;
    assessment: RiskAssessment | null;
  }> {
    const app = await manager.findOne(MerchantApplication, {
      where: { id: applicationId },
      lock: { mode: 'pessimistic_write' },
    });
    const assessment = await manager.findOne(RiskAssessment, {
      where: { applicationId, submissionNumber },
      lock: { mode: 'pessimistic_write' },
    });
    return { app, assessment };
  }

  private saveResult(
    job: RiskJobData,
    result: KybResult,
  ): Promise<RiskRunOutcome> {
    return this.dataSource.transaction(async (manager) => {
      const { app, assessment } = await this.lockBoth(manager, job);
      // Another run of the same job finished while we waited for the provider.
      if (assessment?.status === RiskAssessmentStatus.COMPLETED) {
        return 'DUPLICATE';
      }
      if (
        !app ||
        !assessment ||
        !this.isCurrent(app, assessment, job.submissionNumber)
      ) {
        return 'STALE';
      }

      await manager.update(
        RiskAssessment,
        { id: assessment.id },
        {
          status: RiskAssessmentStatus.COMPLETED,
          provider: this.provider.name,
          providerReference: result.providerReference,
          riskScore: result.riskScore,
          riskLevel: result.riskLevel,
          reasons: result.reasons,
          attempts: assessment.attempts + 1,
          completedAt: new Date(),
        },
      );
      await manager.update(
        MerchantApplication,
        { id: app.id },
        {
          status: ApplicationStatus.IN_REVIEW,
          riskStatus: RiskStatus.COMPLETED,
          riskLevel: result.riskLevel,
        },
      );
      await this.audit.record(manager, {
        actor: SystemActor.SYSTEM,
        action: AuditAction.RISK_ASSESSMENT_COMPLETED,
        entityType: AuditEntityType.MERCHANT_APPLICATION,
        entityId: app.id,
        metadata: {
          from: app.status,
          to: ApplicationStatus.IN_REVIEW,
          submissionNumber: job.submissionNumber,
          riskLevel: result.riskLevel,
          riskScore: result.riskScore,
        },
      });
      return 'COMPLETED';
    });
  }

  /** Counts the attempt. On the last one: FAILED, and an ADMIN can retry. */
  private async recordFailedAttempt(
    job: RiskJobData,
    message: string,
    isLastAttempt: boolean,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const { app, assessment } = await this.lockBoth(manager, job);
      if (
        !app ||
        !assessment ||
        !this.isCurrent(app, assessment, job.submissionNumber)
      ) {
        return;
      }
      const attempts = assessment.attempts + 1;

      await manager.update(
        RiskAssessment,
        { id: assessment.id },
        {
          attempts,
          lastError: message,
          ...(isLastAttempt && { status: RiskAssessmentStatus.FAILED }),
        },
      );
      if (!isLastAttempt) {
        return;
      }

      this.logger.warn(
        `Risk check failed for good: application ${app.id}, submission ${job.submissionNumber}, ${attempts} attempts`,
      );
      await manager.update(
        MerchantApplication,
        { id: app.id },
        { riskStatus: RiskStatus.FAILED },
      );
      await this.audit.record(manager, {
        actor: SystemActor.SYSTEM,
        action: AuditAction.RISK_ASSESSMENT_FAILED,
        entityType: AuditEntityType.MERCHANT_APPLICATION,
        entityId: app.id,
        metadata: {
          submissionNumber: job.submissionNumber,
          attempts,
          lastError: message,
        },
      });
    });
  }
}
