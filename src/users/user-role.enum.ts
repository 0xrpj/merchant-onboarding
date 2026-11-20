export enum UserRole {
  /** Full operational access: sees everything, assigns reviewers, retries risk checks. Never decides. */
  ADMIN = 'ADMIN',
  /** Decides on applications, but only those assigned to them. */
  REVIEWER = 'REVIEWER',
  /** Creates, edits and submits their own applications. Never decides. */
  SALES = 'SALES',
}
