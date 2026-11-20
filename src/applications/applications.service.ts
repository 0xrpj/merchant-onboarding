import { HttpStatus, Injectable } from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import {
  ApplicationStatus,
  RiskStatus,
} from '@/applications/application.enums';
import {
  toApplicationDetail,
  toApplicationSummary,
} from '@/applications/application.mapper';
import { ApplicationsRepository } from '@/applications/applications.repository';
import { assertCanPerform } from '@/applications/domain/application-transitions';
import { assertOwnerRules } from '@/applications/domain/owner-rules';
import { visibilityScope } from '@/applications/domain/visibility';
import type {
  ApplicationDto,
  ApplicationListResponseDto,
} from '@/applications/dto/application-response.dto';
import type {
  CreateApplicationDto,
  CreateOwnerDto,
  ProcessingDto,
} from '@/applications/dto/create-application.dto';
import type {
  UpdateApplicationDto,
  UpdateOwnerDto,
} from '@/applications/dto/update-application.dto';
import type { ListApplicationsQueryDto } from '@/applications/dto/list-applications-query.dto';
import { MerchantApplication } from '@/applications/entities/merchant-application.entity';
import { MerchantOwner } from '@/applications/entities/merchant-owner.entity';
import { applicationNotFound } from '@/applications/not-found';
import { AuditAction, AuditEntityType } from '@/audit/audit-action.enum';
import { AuditService } from '@/audit/audit.service';
import type { AuditLogListResponseDto } from '@/audit/dto/audit-log.dto';
import { assertRole } from '@/auth/assert-role';
import type { AuthUser } from '@/auth/auth-user';
import { AppException, type ErrorDetail } from '@/common/errors/app.exception';
import { ErrorCode } from '@/common/errors/error-codes';
import { lastFour } from '@/common/masking/masking';
import {
  pageMeta,
  type PaginationQueryDto,
} from '@/common/pagination/pagination.dto';
import { FieldEncryptionService } from '@/crypto/field-encryption.service';
import { UserRole } from '@/users/user-role.enum';

/** Who may create, edit and submit. (Checked by @Roles too; repeated here as a second line of defence.) */
export const AUTHORING_ROLES = [UserRole.SALES, UserRole.ADMIN] as const;

type OwnerFields = Pick<
  MerchantOwner,
  'fullName' | 'email' | 'phone' | 'ownershipPercent' | 'isPrimaryContact'
>;

type NewOwner = UpdateOwnerDto & { nationalId: string };

const ownerFields = (owner: CreateOwnerDto | UpdateOwnerDto): OwnerFields => ({
  fullName: owner.fullName,
  email: owner.email.toLowerCase(),
  phone: owner.phone,
  ownershipPercent: owner.ownershipPercent,
  isPrimaryContact: owner.isPrimaryContact,
});

const processingColumns = (processing: ProcessingDto) => ({
  expectedMonthlyVolumeMinor: processing.expectedMonthlyVolumeMinor,
  averageTransactionMinor: processing.averageTransactionMinor,
  currency: processing.currency,
  processingChannels: processing.channels,
});

const invalidOwners = (details: ErrorDetail[]): AppException =>
  new AppException(
    HttpStatus.BAD_REQUEST,
    ErrorCode.VALIDATION_FAILED,
    'Owner list is invalid',
    details,
  );

/** Create, read, list and edit. State-changing actions live in ApplicationLifecycleService. */
@Injectable()
export class ApplicationsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly repo: ApplicationsRepository,
    private readonly encryption: FieldEncryptionService,
    private readonly audit: AuditService,
  ) {}

  async create(
    user: AuthUser,
    dto: CreateApplicationDto,
  ): Promise<ApplicationDto> {
    assertRole(user, AUTHORING_ROLES);
    assertOwnerRules(dto.owners);

    const id = await this.dataSource.transaction(async (manager) => {
      const app = await manager.save(
        manager.create(MerchantApplication, {
          businessName: dto.businessName,
          legalBusinessName: dto.legalBusinessName,
          businessType: dto.businessType,
          industry: dto.industry,
          registrationNumber: dto.registrationNumber,
          ...processingColumns(dto.processing),
          status: ApplicationStatus.DRAFT,
          riskStatus: RiskStatus.NOT_STARTED,
          riskLevel: null,
          submissionCount: 0,
          // Always the caller. The body can't set it (unknown fields are rejected).
          createdById: user.id,
          assignedReviewerId: null,
          submittedAt: null,
          decidedAt: null,
        }),
      );

      await manager.insert(
        MerchantOwner,
        dto.owners.map((owner) => ({
          applicationId: app.id,
          ...ownerFields(owner),
          ...this.nationalIdColumns(owner.nationalId),
        })),
      );

      await this.audit.record(manager, {
        actor: { id: user.id, role: user.role },
        action: AuditAction.APPLICATION_CREATED,
        entityType: AuditEntityType.MERCHANT_APPLICATION,
        entityId: app.id,
        metadata: {
          status: ApplicationStatus.DRAFT,
          ownerCount: dto.owners.length,
        },
      });
      return app.id;
    });

    return this.get(user, id);
  }

  async get(
    user: AuthUser,
    id: string,
    manager?: EntityManager,
  ): Promise<ApplicationDto> {
    const app = await this.repo.findDetail(id, visibilityScope(user), manager);
    if (!app) {
      throw applicationNotFound();
    }
    return toApplicationDetail(app, user.role);
  }

  async list(
    user: AuthUser,
    query: ListApplicationsQueryDto,
  ): Promise<ApplicationListResponseDto> {
    const [apps, total] = await this.repo.list(visibilityScope(user), query);
    return {
      data: apps.map(toApplicationSummary),
      meta: pageMeta(query, total),
    };
  }

  /**
   * Edit while DRAFT or INFO_REQUESTED. Top-level fields can be sent one at a
   * time; `processing` and `owners` replace their whole group.
   */
  async update(
    user: AuthUser,
    id: string,
    dto: UpdateApplicationDto,
  ): Promise<ApplicationDto> {
    assertRole(user, AUTHORING_ROLES);

    return this.dataSource.transaction(async (manager) => {
      // Lock first, then check: a submit running at the same moment either
      // finishes before us (we then see SUBMITTED and refuse) or waits for us.
      const app = await this.repo.lockVisible(
        manager,
        id,
        visibilityScope(user),
      );
      if (!app) {
        throw applicationNotFound();
      }
      assertCanPerform('edit', app.status);

      const updates: Partial<MerchantApplication> = {
        ...(dto.businessName !== undefined && {
          businessName: dto.businessName,
        }),
        ...(dto.legalBusinessName !== undefined && {
          legalBusinessName: dto.legalBusinessName,
        }),
        ...(dto.businessType !== undefined && {
          businessType: dto.businessType,
        }),
        ...(dto.industry !== undefined && { industry: dto.industry }),
        ...(dto.registrationNumber !== undefined && {
          registrationNumber: dto.registrationNumber,
        }),
        ...(dto.processing !== undefined && processingColumns(dto.processing)),
      };

      // Field names only, never values: the audit log must not copy personal data.
      const changedFields = (
        Object.keys(updates) as (keyof MerchantApplication)[]
      )
        .filter(
          (field) =>
            JSON.stringify(updates[field]) !== JSON.stringify(app[field]),
        )
        .map(String);

      if (dto.owners !== undefined) {
        await this.replaceOwners(manager, app.id, dto.owners);
        changedFields.push('owners');
      }

      if (changedFields.length > 0) {
        // updatedAt is set explicitly so it moves even when only owners changed.
        await manager.update(
          MerchantApplication,
          { id: app.id },
          { ...updates, updatedAt: new Date() },
        );
        await this.audit.record(manager, {
          actor: { id: user.id, role: user.role },
          action: AuditAction.APPLICATION_UPDATED,
          entityType: AuditEntityType.MERCHANT_APPLICATION,
          entityId: app.id,
          metadata: { status: app.status, changedFields },
        });
      }

      return this.get(user, app.id, manager);
    });
  }

  /** The audit trail of one application (ADMIN). 404 if it doesn't exist. */
  async auditTrail(
    user: AuthUser,
    id: string,
    query: PaginationQueryDto,
  ): Promise<AuditLogListResponseDto> {
    assertRole(user, [UserRole.ADMIN]);
    if (!(await this.repo.existsVisible(id, visibilityScope(user)))) {
      throw applicationNotFound();
    }
    return this.audit.listForEntity(
      AuditEntityType.MERCHANT_APPLICATION,
      id,
      query,
    );
  }

  /**
   * Replaces the owner list with `input` (see UpdateOwnerDto for the rules).
   * Runs inside the caller's transaction, after the application row is locked.
   */
  private async replaceOwners(
    manager: EntityManager,
    applicationId: string,
    input: UpdateOwnerDto[],
  ): Promise<void> {
    const existing = await manager.find(MerchantOwner, {
      where: { applicationId },
    });
    const existingIds = new Set(existing.map((owner) => owner.id));

    // 1. Every id must be an owner of THIS application (blocks tampering with
    //    another application's owners), listed once; new owners need a national ID.
    const details: ErrorDetail[] = [];
    const seen = new Set<string>();
    input.forEach((owner, index) => {
      if (owner.id === undefined) {
        if (owner.nationalId === undefined) {
          details.push({
            field: `owners.${index}.nationalId`,
            messages: ['nationalId is required for a new owner'],
          });
        }
        return;
      }
      if (!existingIds.has(owner.id)) {
        details.push({
          field: `owners.${index}.id`,
          messages: ['id is not an owner of this application'],
        });
      } else if (seen.has(owner.id)) {
        details.push({
          field: `owners.${index}.id`,
          messages: ['id is listed twice'],
        });
      }
      seen.add(owner.id);
    });
    if (details.length > 0) {
      throw invalidOwners(details);
    }

    // 2. The list as a whole: 1-10 owners, <= 100%, exactly one primary contact.
    assertOwnerRules(input);

    // 3. Apply in an order that never has two primary contacts at once (the
    //    database index allows at most one): delete, then demote before
    //    promote, then insert.
    const removedIds = existing
      .filter((owner) => !seen.has(owner.id))
      .map((o) => o.id);
    if (removedIds.length > 0) {
      await manager.delete(MerchantOwner, {
        id: In(removedIds),
        applicationId,
      });
    }

    const kept = input
      .filter((owner) => owner.id !== undefined)
      .sort((a, b) => Number(a.isPrimaryContact) - Number(b.isPrimaryContact));
    for (const owner of kept) {
      await manager.update(
        MerchantOwner,
        { id: owner.id, applicationId },
        {
          ...ownerFields(owner),
          // Left out = keep the stored national ID.
          ...(owner.nationalId !== undefined &&
            this.nationalIdColumns(owner.nationalId)),
        },
      );
    }

    const added = input.filter(
      (owner): owner is NewOwner =>
        owner.id === undefined && owner.nationalId !== undefined,
    );
    if (added.length > 0) {
      await manager.insert(
        MerchantOwner,
        added.map((owner) => ({
          applicationId,
          ...ownerFields(owner),
          ...this.nationalIdColumns(owner.nationalId),
        })),
      );
    }
  }

  /** Encrypted value plus the last 4 characters for masked display. */
  private nationalIdColumns(nationalId: string) {
    return {
      nationalIdEncrypted: this.encryption.encrypt(nationalId),
      nationalIdLast4: lastFour(nationalId),
    };
  }
}
