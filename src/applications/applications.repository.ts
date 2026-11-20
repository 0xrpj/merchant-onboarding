import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import type { VisibilityScope } from '@/applications/domain/visibility';
import type { ListApplicationsQueryDto } from '@/applications/dto/list-applications-query.dto';
import { MerchantApplication } from '@/applications/entities/merchant-application.entity';
import { pageWindow } from '@/common/pagination/pagination.dto';

/**
 * Database access for applications. Every method takes a VisibilityScope,
 * so no query can forget the object-level check.
 */
@Injectable()
export class ApplicationsRepository {
  constructor(
    @InjectRepository(MerchantApplication)
    private readonly apps: Repository<MerchantApplication>,
  ) {}

  /** Full detail, or null when it doesn't exist or the user can't see it. */
  findDetail(
    id: string,
    scope: VisibilityScope,
    manager?: EntityManager,
  ): Promise<MerchantApplication | null> {
    const repo = manager?.getRepository(MerchantApplication) ?? this.apps;
    return repo.findOne({
      where: { id, ...scope },
      relations: {
        createdBy: true,
        assignedReviewer: true,
        owners: true,
        riskAssessments: true,
        decisions: { reviewer: true },
      },
      // One query per relation instead of one giant join (owners x assessments x decisions).
      relationLoadStrategy: 'query',
    });
  }

  /**
   * Loads and locks the row (SELECT ... FOR UPDATE) until the transaction ends.
   * A second action on the same application waits here, then sees the new state.
   * No relations: Postgres can't lock the nullable side of an outer join.
   */
  lockVisible(
    manager: EntityManager,
    id: string,
    scope: VisibilityScope,
  ): Promise<MerchantApplication | null> {
    return manager.findOne(MerchantApplication, {
      where: { id, ...scope },
      lock: { mode: 'pessimistic_write' },
    });
  }

  /** Whether the user can see the application. */
  existsVisible(id: string, scope: VisibilityScope): Promise<boolean> {
    return this.apps.exists({ where: { id, ...scope } });
  }

  /**
   * One page of summaries, newest first. The scope and every filter are joined
   * with AND, so filters can only narrow what the user may see.
   */
  list(
    scope: VisibilityScope,
    query: ListApplicationsQueryDto,
  ): Promise<[MerchantApplication[], number]> {
    const qb = this.apps
      .createQueryBuilder('app')
      .leftJoinAndSelect('app.createdBy', 'createdBy')
      .leftJoinAndSelect('app.assignedReviewer', 'assignedReviewer');

    if (scope.createdById !== undefined) {
      qb.andWhere('app.createdById = :scopeCreatedById', {
        scopeCreatedById: scope.createdById,
      });
    }
    if (scope.assignedReviewerId !== undefined) {
      qb.andWhere('app.assignedReviewerId = :scopeReviewerId', {
        scopeReviewerId: scope.assignedReviewerId,
      });
    }

    if (query.status?.length) {
      qb.andWhere('app.status IN (:...statuses)', { statuses: query.status });
    }
    if (query.riskStatus !== undefined) {
      qb.andWhere('app.riskStatus = :riskStatus', {
        riskStatus: query.riskStatus,
      });
    }
    if (query.riskLevel !== undefined) {
      qb.andWhere('app.riskLevel = :riskLevel', { riskLevel: query.riskLevel });
    }
    if (query.assignedReviewerId !== undefined) {
      qb.andWhere('app.assignedReviewerId = :assignedReviewerId', {
        assignedReviewerId: query.assignedReviewerId,
      });
    }
    if (query.unassigned !== undefined) {
      qb.andWhere(
        query.unassigned
          ? 'app.assignedReviewerId IS NULL'
          : 'app.assignedReviewerId IS NOT NULL',
      );
    }

    const { skip, take } = pageWindow(query);
    return (
      qb
        .orderBy('app.createdAt', 'DESC')
        // Same timestamp? The id keeps the order stable between pages.
        .addOrderBy('app.id', 'DESC')
        .skip(skip)
        .take(take)
        .getManyAndCount()
    );
  }
}
