/** One risk check (one submission). */
export enum RiskAssessmentStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  /** Every retry failed. An ADMIN can retry it again. */
  FAILED = 'FAILED',
}
