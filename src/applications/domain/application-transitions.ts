import { HttpStatus } from '@nestjs/common';
import {
  ApplicationStatus,
  DecisionType,
  RiskLevel,
} from '@/applications/application.enums';
import { AppException } from '@/common/errors/app.exception';
import { ErrorCode } from '@/common/errors/error-codes';

const { DRAFT, SUBMITTED, IN_REVIEW, INFO_REQUESTED, APPROVED, REJECTED } =
  ApplicationStatus;

/** Everything a person or the worker can do to an application. */
export type ApplicationAction =
  'edit' | 'submit' | 'assign' | 'decide' | 'retryRisk' | 'completeRisk';

/**
 * The state machine as one table: the states each action is allowed from.
 * Anything not listed here is refused with 409. APPROVED and REJECTED appear
 * nowhere, so nothing can ever happen to a final application.
 */
export const ALLOWED_FROM: Record<
  ApplicationAction,
  readonly ApplicationStatus[]
> = {
  edit: [DRAFT, INFO_REQUESTED],
  // Submit from DRAFT, resubmit from INFO_REQUESTED.
  submit: [DRAFT, INFO_REQUESTED],
  // A reviewer can be assigned while the risk check runs, so they're ready when it's done.
  assign: [SUBMITTED, IN_REVIEW, INFO_REQUESTED],
  decide: [IN_REVIEW],
  // Also needs risk status FAILED (checked by the lifecycle service).
  retryRisk: [SUBMITTED],
  // Worker only: the risk check finished.
  completeRisk: [SUBMITTED],
};

/** Where each decision takes the application. */
export const DECISION_OUTCOME: Record<DecisionType, ApplicationStatus> = {
  [DecisionType.APPROVE]: APPROVED,
  [DecisionType.REJECT]: REJECTED,
  [DecisionType.REQUEST_INFO]: INFO_REQUESTED,
};

export const FINAL_STATUSES: readonly ApplicationStatus[] = [
  APPROVED,
  REJECTED,
];

export const canPerform = (
  action: ApplicationAction,
  status: ApplicationStatus,
): boolean => ALLOWED_FROM[action].includes(status);

// Used in error messages: "Cannot <verb> an application in SUBMITTED state".
const ACTION_VERB: Record<ApplicationAction, string> = {
  edit: 'edit',
  submit: 'submit',
  assign: 'assign a reviewer to',
  decide: 'decide on',
  retryRisk: 'retry the risk check of',
  completeRisk: 'complete the risk check of',
};

const DECISION_VERB: Record<DecisionType, string> = {
  [DecisionType.APPROVE]: 'approve',
  [DecisionType.REJECT]: 'reject',
  [DecisionType.REQUEST_INFO]: 'request info on',
};

/** 409 INVALID_STATE_TRANSITION unless `action` is allowed in `status`. */
export const assertCanPerform = (
  action: ApplicationAction,
  status: ApplicationStatus,
  decision?: DecisionType,
): void => {
  if (canPerform(action, status)) {
    return;
  }
  const verb = decision ? DECISION_VERB[decision] : ACTION_VERB[action];
  throw new AppException(
    HttpStatus.CONFLICT,
    ErrorCode.INVALID_STATE_TRANSITION,
    `Cannot ${verb} an application in ${status} state`,
  );
};

/**
 * A written note is required to reject, to request info, and to approve a
 * HIGH-risk application (the reviewer must justify overriding the risk signal).
 */
export const isNoteRequired = (
  decision: DecisionType,
  riskLevel: RiskLevel | null,
): boolean => decision !== DecisionType.APPROVE || riskLevel === RiskLevel.HIGH;
