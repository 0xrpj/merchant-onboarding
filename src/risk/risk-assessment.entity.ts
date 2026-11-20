import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { RiskLevel } from '@/applications/application.enums';
import { MerchantApplication } from '@/applications/entities/merchant-application.entity';
import { RiskAssessmentStatus } from '@/risk/risk-assessment-status.enum';

/** One risk check: one per submission of an application. */
@Entity('risk_assessments')
// The database-level idempotency guarantee: even two workers running at the
// same moment can't store two results for the same submission.
@Unique('UQ_risk_assessments_application_submission', [
  'applicationId',
  'submissionNumber',
])
@Check(
  'CHK_risk_assessments_score_range',
  `"risk_score" IS NULL OR ("risk_score" >= 0 AND "risk_score" <= 100)`,
)
export class RiskAssessment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  applicationId: string;

  @ManyToOne(
    () => MerchantApplication,
    (application) => application.riskAssessments,
  )
  @JoinColumn({ name: 'application_id' })
  application?: MerchantApplication;

  /** Which submission this check is for. */
  @Column({ type: 'int' })
  submissionNumber: number;

  @Column({
    type: 'enum',
    enum: RiskAssessmentStatus,
    enumName: 'risk_assessment_status',
    default: RiskAssessmentStatus.PENDING,
  })
  status: RiskAssessmentStatus;

  @Column({ type: 'varchar', length: 50 })
  provider: string;

  /** The ID the (simulated) provider returned. */
  @Column({ type: 'varchar', length: 100, nullable: true })
  providerReference: string | null;

  /** 0 (safest) to 100. */
  @Column({ type: 'int', nullable: true })
  riskScore: number | null;

  @Column({
    type: 'enum',
    enum: RiskLevel,
    enumName: 'risk_level',
    nullable: true,
  })
  riskLevel: RiskLevel | null;

  /** Why the score is what it is, e.g. ["High-risk industry"]. */
  @Column({ type: 'jsonb', default: () => `'[]'::jsonb` })
  reasons: string[];

  /** How many tries so far, across automatic and manual retries. */
  @Column({ type: 'int', default: 0 })
  attempts: number;

  /** Short message of the last failure. Never contains personal data. */
  @Column({ type: 'text', nullable: true })
  lastError: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;
}
