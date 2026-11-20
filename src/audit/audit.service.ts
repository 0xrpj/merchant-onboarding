import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import {
  AuditAction,
  AuditEntityType,
  SystemActor,
} from '@/audit/audit-action.enum';
import { AuditLog } from '@/audit/audit-log.entity';
import {
  AuditLogDto,
  AuditLogListResponseDto,
} from '@/audit/dto/audit-log.dto';
import { redactMetadata } from '@/common/masking/masking';
import {
  pageMeta,
  pageWindow,
  PaginationQueryDto,
} from '@/common/pagination/pagination.dto';
import { getRequestId } from '@/common/request-id/request-context';

export type AuditActor = { id: string; role: string } | SystemActor;

export type AuditEntry = {
  actor: AuditActor;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string | null;
  metadata?: Record<string, unknown>;
};

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog) private readonly logs: Repository<AuditLog>,
  ) {}

  /**
   * Writes one entry using the caller's transaction (`manager`), so the entry
   * is saved if and only if the change it describes is saved.
   */
  async record(manager: EntityManager, entry: AuditEntry): Promise<void> {
    const { actor } = entry;

    await manager.save(
      manager.create(AuditLog, {
        // A SystemActor is a plain string; a person is { id, role }.
        actorId: typeof actor === 'string' ? null : actor.id,
        actorRole: typeof actor === 'string' ? actor : actor.role,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        metadata: redactMetadata(entry.metadata ?? {}),
        requestId: getRequestId() ?? null,
      }),
    );
  }

  async listForEntity(
    entityType: AuditEntityType,
    entityId: string,
    query: PaginationQueryDto,
  ): Promise<AuditLogListResponseDto> {
    const [logs, total] = await this.logs.findAndCount({
      where: { entityType, entityId },
      order: { createdAt: 'DESC' },
      ...pageWindow(query),
    });

    return { data: logs.map(toAuditLogDto), meta: pageMeta(query, total) };
  }
}

const toAuditLogDto = (log: AuditLog): AuditLogDto => ({
  id: log.id,
  action: log.action,
  actorId: log.actorId,
  actorRole: log.actorRole,
  entityType: log.entityType,
  entityId: log.entityId,
  metadata: log.metadata,
  requestId: log.requestId,
  createdAt: log.createdAt,
});
