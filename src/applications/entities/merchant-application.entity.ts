import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  ApplicationStatus,
  BusinessType,
  Industry,
  ProcessingChannel,
  RiskLevel,
  RiskStatus,
} from '@/applications/application.enums';
import { MerchantOwner } from '@/applications/entities/merchant-owner.entity';
import { ReviewDecision } from '@/applications/entities/review-decision.entity';
import { bigintToNumber } from '@/database/transformers';
import { RiskAssessment } from '@/risk/risk-assessment.entity';
import { User } from '@/users/user.entity';

/**
 * A business asking to accept payments. Never deleted: payment companies keep history.
 * Money is stored as whole paisa (1 NPR = 100 paisa) in bigint, never as floats.
 */
@Entity('merchant_applications')
// One index per list: each role's list filters on its own column, then status, newest first.
@Index('IDX_merchant_applications_sales_list', [
  'createdById',
  'status',
  'createdAt',
])
@Index('IDX_merchant_applications_reviewer_list', [
  'assignedReviewerId',
  'status',
  'createdAt',
])
@Index('IDX_merchant_applications_admin_list', ['status', 'createdAt'])
// The database rejects bad data even if the code has a bug.
@Check(
  'CHK_merchant_applications_volume_positive',
  `"expected_monthly_volume_minor" > 0`,
)
@Check(
  'CHK_merchant_applications_average_positive',
  `"average_transaction_minor" > 0`,
)
@Check(
  'CHK_merchant_applications_channels_not_empty',
  `cardinality("processing_channels") > 0`,
)
@Check('CHK_merchant_applications_submission_count', `"submission_count" >= 0`)
export class MerchantApplication {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // --- Business ---

  /** Trading name, e.g. "Himal Brew Café". */
  @Column({ type: 'varchar', length: 200 })
  businessName: string;

  /** Registered name, e.g. "Himal Brew Pvt. Ltd.". */
  @Column({ type: 'varchar', length: 200 })
  legalBusinessName: string;

  @Column({ type: 'enum', enum: BusinessType, enumName: 'business_type' })
  businessType: BusinessType;

  @Column({ type: 'enum', enum: Industry, enumName: 'industry' })
  industry: Industry;

  /** Company registration number (public information). */
  @Column({ type: 'varchar', length: 50 })
  registrationNumber: string;

  // --- Requested processing ---

  @Column({ type: 'bigint', transformer: bigintToNumber })
  expectedMonthlyVolumeMinor: number;

  @Column({ type: 'bigint', transformer: bigintToNumber })
  averageTransactionMinor: number;

  /** ISO 4217 code. */
  @Column({ type: 'char', length: 3, default: 'NPR' })
  currency: string;

  @Column({
    type: 'enum',
    enum: ProcessingChannel,
    enumName: 'processing_channel',
    array: true,
  })
  processingChannels: ProcessingChannel[];

  // --- Workflow ---

  @Column({
    type: 'enum',
    enum: ApplicationStatus,
    enumName: 'application_status',
    default: ApplicationStatus.DRAFT,
  })
  status: ApplicationStatus;

  @Column({
    type: 'enum',
    enum: RiskStatus,
    enumName: 'risk_status',
    default: RiskStatus.NOT_STARTED,
  })
  riskStatus: RiskStatus;

  /** Copy of the latest completed risk result, for quick filtering. */
  @Column({
    type: 'enum',
    enum: RiskLevel,
    enumName: 'risk_level',
    nullable: true,
  })
  riskLevel: RiskLevel | null;

  /** +1 on every submit. Together with the id it identifies one risk check. */
  @Column({ type: 'int', default: 0 })
  submissionCount: number;

  /** The SALES isolation check uses this. */
  @Column({ type: 'uuid' })
  createdById: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by_id' })
  createdBy?: User;

  /** The reviewer check uses this. */
  @Column({ type: 'uuid', nullable: true })
  assignedReviewerId: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'assigned_reviewer_id' })
  assignedReviewer?: User | null;

  /** The latest submission. */
  @Column({ type: 'timestamptz', nullable: true })
  submittedAt: Date | null;

  /** When it became APPROVED or REJECTED. */
  @Column({ type: 'timestamptz', nullable: true })
  decidedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => MerchantOwner, (owner) => owner.application)
  owners?: MerchantOwner[];

  @OneToMany(() => RiskAssessment, (assessment) => assessment.application)
  riskAssessments?: RiskAssessment[];

  @OneToMany(() => ReviewDecision, (decision) => decision.application)
  decisions?: ReviewDecision[];
}
