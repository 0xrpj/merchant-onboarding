import { AuditAction } from '@/audit/audit-action.enum';
import { PageMetaDto } from '@/common/pagination/pagination.dto';

export class AuditLogDto {
  id: string;
  action: AuditAction;
  /** Empty when the system or an unauthenticated caller acted. */
  actorId: string | null;
  actorRole: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown>;
  requestId: string | null;
  createdAt: Date;
}

export class AuditLogListResponseDto {
  data: AuditLogDto[];
  meta: PageMetaDto;
}
