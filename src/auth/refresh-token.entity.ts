import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '@/users/user.entity';

/**
 * One refresh token. Only its SHA-256 hash is stored, never the token itself.
 * Every token from one login shares a family_id. Each token works once;
 * presenting a used one again revokes the whole family (reuse detection).
 */
@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Index('IDX_refresh_tokens_family')
  @Column({ type: 'uuid' })
  familyId: string;

  @Column({ type: 'char', length: 64, unique: true })
  tokenHash: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  /** Set when the token is used, on logout, or when reuse is detected. */
  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  replacedById: string | null;

  @ManyToOne(() => RefreshToken, { nullable: true })
  @JoinColumn({ name: 'replaced_by_id' })
  replacedBy?: RefreshToken | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
