export const RISK_QUEUE = 'risk-assessment';
export const RISK_JOB = 'assess';

/** Saved on each risk assessment row. */
export const SIMULATED_KYB_PROVIDER = 'SIMULATED_KYB';

/** What a job carries: only IDs. The worker loads everything else from the database. */
export type RiskJobData = {
  applicationId: string;
  submissionNumber: number;
};

/**
 * Queue-level idempotency: BullMQ ignores a new job whose ID already exists,
 * so submitting twice still queues one job.
 * (BullMQ job IDs can't contain ":", hence the dashes.)
 */
export const riskJobId = (
  applicationId: string,
  submissionNumber: number,
): string => `risk-${applicationId}-${submissionNumber}`;

/**
 * A manual ADMIN retry needs a new ID: BullMQ silently ignores an ID it still
 * stores, even the ID of a failed job.
 */
export const riskRetryJobId = (
  applicationId: string,
  submissionNumber: number,
  retriedAt: Date,
): string =>
  `${riskJobId(applicationId, submissionNumber)}-retry-${retriedAt.getTime()}`;
