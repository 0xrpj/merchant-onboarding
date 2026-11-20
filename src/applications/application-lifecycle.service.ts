import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  ApplicationStatus,
  RiskStatus,
} from '@/applications/application.enums';
import {
  ApplicationsService,
  AUTHORING_ROLES,
} from '@/applications/applications.service';
import { ApplicationsRepository } from '@/applications/applications.repository';
import {
  assertCanPerform,
  DECISION_OUTCOME,
  FINAL_STATUSES,
  isNoteRequired,
} from '@/applications/domain/application-transitions';
import { visibilityScope } from '@/applications/domain/visibility';
import type {
  AssignReviewerDto,
  RecordDecisionDto,
} from '@/applications/dto/application-actions.dto';
import type { ApplicationDto } from '@/applications/dto/application-response.dto';
import { MerchantApplication } from '@/applications/entities/merchant-application.entity';
import { ReviewDecision } from '@/applications/entities/review-decision.entity';
import { applicationNotFound } from '@/applications/not-found';
import {
  AuditAction,
  AuditEntityType,
  SystemActor,
} from '@/audit/audit-action.enum';
import { AuditService } from '@/audit/audit.service';
import { assertRole } from '@/auth/assert-role';
import type { AuthUser } from '@/auth/auth-user';
import { AppException } from '@/common/errors/app.exception';
import { ErrorCode } from '@/common/errors/error-codes';
import { RiskAssessmentStatus } from '@/risk/risk-assessment-status.enum';
import { RiskAssessment } from '@/risk/risk-assessment.entity';
import {
  riskJobId,
  riskRetryJobId,
  SIMULATED_KYB_PROVIDER,
} from '@/risk/risk-queue.constants';
import { RiskQueueService } from '@/risk/risk-queue.service';
import { UsersService } from '@/users/users.service';
import { UserRole } from '@/users/user-role.enum';

/**
 * The actions that move an application through its lifecycle. Each one:
 * 1. locks the application row (visible to this user, or 404),
 * 2. checks the state machine (or 409),
 * 3. changes the data and writes the audit entry in the same transaction.
 */
@Injectable()
export class ApplicationLifecycleService {
  private readonly logger = new Logger(ApplicationLifecycleService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly repo: ApplicationsRepository,
    private readonly applications: ApplicationsService,
    private readonly users: UsersService,
    private readonly riskQueue: RiskQueueService,
    private readonly audit: AuditService,
  ) {}

  /** Submit (from DRAFT) or resubmit (from INFO_REQUESTED). Starts a new risk check. */
  async submit(user: AuthUser, id: string): Promise<ApplicationDto> {
    assertRole(user, AUTHORING_ROLES);

    const submissionNumber = await this.dataSource.transaction(
      async (manager) => {
        const app = await this.repo.lockVisible(
          manager,
          id,
          visibilityScope(user),
        );
        if (!app) {
          throw applicationNotFound();
        }
        assertCanPerform('submit', app.status);

        const next = app.submissionCount + 1;
        await manager.update(
          MerchantApplication,
          { id: app.id },
          {
            status: ApplicationStatus.SUBMITTED,
            riskStatus: RiskStatus.PENDING,
            // The old level belonged to the old data; the new check sets a new one.
            riskLevel: null,
            submissionCount: next,
            submittedAt: new Date(),
          },
        );
        // One row per submission. UNIQUE (application_id, submission_number).
        await manager.insert(RiskAssessment, {
          applicationId: app.id,
          submissionNumber: next,
          status: RiskAssessmentStatus.PENDING,
          provider: SIMULATED_KYB_PROVIDER,
        });
        await this.audit.record(manager, {
          actor: { id: user.id, role: user.role },
          action: AuditAction.APPLICATION_SUBMITTED,
          entityType: AuditEntityType.MERCHANT_APPLICATION,
          entityId: app.id,
          metadata: {
            from: app.status,
            to: ApplicationStatus.SUBMITTED,
            submissionNumber: next,
          },
        });
        return next;
      },
    );

    // Queued only after the commit, so the worker never gets a job for a
    // submission that isn't saved yet.
    await this.queueRiskCheck(
      id,
      submissionNumber,
      riskJobId(id, submissionNumber),
    );
    return this.applications.get(user, id);
  }

  /** ADMIN: assign or reassign the reviewer. */
  async assign(
    user: AuthUser,
    id: string,
    dto: AssignReviewerDto,
  ): Promise<ApplicationDto> {
    assertRole(user, [UserRole.ADMIN]);

    return this.dataSource.transaction(async (manager) => {
      const app = await this.repo.lockVisible(
        manager,
        id,
        visibilityScope(user),
      );
      if (!app) {
        throw applicationNotFound();
      }
      assertCanPerform('assign', app.status);

      const reviewer = await this.users.findAssignableReviewer(
        dto.reviewerId,
        manager,
      );
      if (!reviewer) {
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          ErrorCode.INVALID_REVIEWER,
          'The reviewer must be an active user with the REVIEWER role',
          [{ field: 'reviewerId', messages: ['is not an active reviewer'] }],
        );
      }

      // Assigning the same reviewer again changes nothing, so it isn't audited.
      if (app.assignedReviewerId !== reviewer.id) {
        await manager.update(
          MerchantApplication,
          { id: app.id },
          { assignedReviewerId: reviewer.id },
        );
        await this.audit.record(manager, {
          actor: { id: user.id, role: user.role },
          action: AuditAction.REVIEWER_ASSIGNED,
          entityType: AuditEntityType.MERCHANT_APPLICATION,
          entityId: app.id,
          metadata: {
            status: app.status,
            fromReviewerId: app.assignedReviewerId,
            toReviewerId: reviewer.id,
          },
        });
      }

      return this.applications.get(user, app.id, manager);
    });
  }

  /**
   * The assigned REVIEWER approves, rejects or requests info. A REVIEWER only
   * "sees" applications assigned to them, so anyone else gets 404.
   */
  async decide(
    user: AuthUser,
    id: string,
    dto: RecordDecisionDto,
  ): Promise<ApplicationDto> {
    // ADMIN sees every application, so this check (not visibility) is what
    // stops an ADMIN from deciding.
    assertRole(user, [UserRole.REVIEWER]);

    return this.dataSource.transaction(async (manager) => {
      const app = await this.repo.lockVisible(
        manager,
        id,
        visibilityScope(user),
      );
      if (!app) {
        throw applicationNotFound();
      }
      assertCanPerform('decide', app.status, dto.decision);

      const note = dto.note ? dto.note : null;
      if (!note && isNoteRequired(dto.decision, app.riskLevel)) {
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          ErrorCode.NOTE_REQUIRED,
          'A note is required to reject, to request info, and to approve a HIGH-risk application',
          [{ field: 'note', messages: ['note is required for this decision'] }],
        );
      }
      if (app.riskLevel === null) {
        // Can't happen: IN_REVIEW is only reached with a completed risk check.
        throw new Error(
          `Application ${app.id} is IN_REVIEW without a risk level`,
        );
      }

      const to = DECISION_OUTCOME[dto.decision];
      await manager.insert(ReviewDecision, {
        applicationId: app.id,
        reviewerId: user.id,
        submissionNumber: app.submissionCount,
        decision: dto.decision,
        note,
        riskLevelAtDecision: app.riskLevel,
      });
      await manager.update(
        MerchantApplication,
        { id: app.id },
        {
          status: to,
          decidedAt: FINAL_STATUSES.includes(to) ? new Date() : null,
        },
      );
      await this.audit.record(manager, {
        actor: { id: user.id, role: user.role },
        action: AuditAction.DECISION_RECORDED,
        entityType: AuditEntityType.MERCHANT_APPLICATION,
        entityId: app.id,
        // The note itself stays out of the audit log (it may contain personal data).
        metadata: {
          decision: dto.decision,
          from: app.status,
          to,
          submissionNumber: app.submissionCount,
          riskLevel: app.riskLevel,
        },
      });

      return this.applications.get(user, app.id, manager);
    });
  }

  /** ADMIN: run a FAILED risk check again. */
  async retryRiskCheck(user: AuthUser, id: string): Promise<ApplicationDto> {
    assertRole(user, [UserRole.ADMIN]);

    const { submissionNumber, retriedAt } = await this.dataSource.transaction(
      async (manager) => {
        const app = await this.repo.lockVisible(
          manager,
          id,
          visibilityScope(user),
        );
        if (!app) {
          throw applicationNotFound();
        }
        assertCanPerform('retryRisk', app.status);
        if (app.riskStatus !== RiskStatus.FAILED) {
          throw new AppException(
            HttpStatus.CONFLICT,
            ErrorCode.INVALID_STATE_TRANSITION,
            `Cannot retry a risk check that is ${app.riskStatus}`,
          );
        }

        await manager.update(
          RiskAssessment,
          { applicationId: app.id, submissionNumber: app.submissionCount },
          { status: RiskAssessmentStatus.PENDING },
        );
        await manager.update(
          MerchantApplication,
          { id: app.id },
          { riskStatus: RiskStatus.PENDING },
        );
        await this.audit.record(manager, {
          actor: { id: user.id, role: user.role },
          action: AuditAction.RISK_ASSESSMENT_RETRIED,
          entityType: AuditEntityType.MERCHANT_APPLICATION,
          entityId: app.id,
          metadata: { submissionNumber: app.submissionCount },
        });
        return { submissionNumber: app.submissionCount, retriedAt: new Date() };
      },
    );

    await this.queueRiskCheck(
      id,
      submissionNumber,
      riskRetryJobId(id, submissionNumber, retriedAt),
    );
    return this.applications.get(user, id);
  }

  /**
   * Puts the job on the queue. If Redis is down, the submission still counts:
   * the risk check is marked FAILED so an ADMIN can retry it later, and the
   * caller gets 202 with riskStatus FAILED instead of an error.
   */
  private async queueRiskCheck(
    applicationId: string,
    submissionNumber: number,
    jobId: string,
  ): Promise<void> {
    try {
      await this.riskQueue.enqueue({ applicationId, submissionNumber }, jobId);
    } catch (error) {
      this.logger.error(
        `Could not queue the risk check for application ${applicationId}, submission ${submissionNumber}`,
        error instanceof Error ? error.stack : String(error),
      );
      await this.markQueueFailure(applicationId, submissionNumber);
    }
  }

  private async markQueueFailure(
    applicationId: string,
    submissionNumber: number,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const app = await this.repo.lockVisible(manager, applicationId, {});
      // Only if nothing has moved on in the meantime.
      if (
        !app ||
        app.status !== ApplicationStatus.SUBMITTED ||
        app.submissionCount !== submissionNumber ||
        app.riskStatus !== RiskStatus.PENDING
      ) {
        return;
      }
      await manager.update(
        RiskAssessment,
        { applicationId, submissionNumber },
        {
          status: RiskAssessmentStatus.FAILED,
          lastError: 'Could not queue the risk check',
        },
      );
      await manager.update(
        MerchantApplication,
        { id: applicationId },
        { riskStatus: RiskStatus.FAILED },
      );
      await this.audit.record(manager, {
        actor: SystemActor.SYSTEM,
        action: AuditAction.RISK_ASSESSMENT_FAILED,
        entityType: AuditEntityType.MERCHANT_APPLICATION,
        entityId: applicationId,
        metadata: { submissionNumber, reason: 'QUEUE_UNAVAILABLE' },
      });
    });
  }
}
