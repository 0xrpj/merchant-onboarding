import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AuditAction } from '@/audit/audit-action.enum';
import { User } from '@/users/user.entity';

/**
 * The compliance record of who did what.
 * Append-only: the migration adds a trigger that rejects UPDATE and DELETE.
 * Every entry is written in the same transaction as the change it records.
 */
@Entity('audit_logs')
@Index('IDX_audit_logs_entity', ['entityType', 'entityId', 'createdAt'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Empty for the system (risk worker) and for unauthenticated callers.
  @Column({ type: 'uuid', nullable: true })
  actorId: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'actor_id' })
  actor?: User | null;

  /** The actor's role at the time, or SYSTEM / ANONYMOUS. */
  @Column({ type: 'varchar', length: 20 })
  actorRole: string;

  @Column({ type: 'enum', enum: AuditAction, enumName: 'audit_action' })
  action: AuditAction;

  @Column({ type: 'varchar', length: 50 })
  entityType: string;

  @Column({ type: 'uuid', nullable: true })
  entityId: string | null;

  /** Already redacted. For edits: the names of changed fields, never their values. */
  @Column({ type: 'jsonb', default: () => `'{}'::jsonb` })
  metadata: Record<string, unknown>;

  /** Ties the entry to one HTTP request (X-Request-Id). Empty for worker actions. */
  @Column({ type: 'varchar', length: 128, nullable: true })
  requestId: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
