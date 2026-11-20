import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DecisionType, RiskLevel } from '@/applications/application.enums';
import { MerchantApplication } from '@/applications/entities/merchant-application.entity';
import { User } from '@/users/user.entity';

/**
 * A reviewer's decision. Business data people work with (sales reads what the
 * reviewer asked for), unlike the audit log, which is the compliance record.
 */
@Entity('review_decisions')
@Index('IDX_review_decisions_application', ['applicationId', 'createdAt'])
export class ReviewDecision {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  applicationId: string;

  @ManyToOne(() => MerchantApplication, (application) => application.decisions)
  @JoinColumn({ name: 'application_id' })
  application?: MerchantApplication;

  @Column({ type: 'uuid' })
  reviewerId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'reviewer_id' })
  reviewer?: User;

  /** Which submission was decided. */
  @Column({ type: 'int' })
  submissionNumber: number;

  @Column({ type: 'enum', enum: DecisionType, enumName: 'decision_type' })
  decision: DecisionType;

  /** Required for REJECT, REQUEST_INFO, and APPROVE on HIGH risk. */
  @Column({ type: 'text', nullable: true })
  note: string | null;

  /** Snapshot of the risk level the reviewer saw. */
  @Column({ type: 'enum', enum: RiskLevel, enumName: 'risk_level' })
  riskLevelAtDecision: RiskLevel;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
