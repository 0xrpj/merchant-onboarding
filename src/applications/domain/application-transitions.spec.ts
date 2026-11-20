import { HttpStatus } from '@nestjs/common';
import {
  ApplicationStatus,
  DecisionType,
  RiskLevel,
} from '@/applications/application.enums';
import {
  ALLOWED_FROM,
  type ApplicationAction,
  assertCanPerform,
  canPerform,
  DECISION_OUTCOME,
  FINAL_STATUSES,
  isNoteRequired,
} from '@/applications/domain/application-transitions';
import { AppException } from '@/common/errors/app.exception';

const ALL_STATUSES = Object.values(ApplicationStatus);
const ALL_ACTIONS = Object.keys(ALLOWED_FROM) as ApplicationAction[];

describe('application state machine', () => {
  it.each([
    ['edit', [ApplicationStatus.DRAFT, ApplicationStatus.INFO_REQUESTED]],
    ['submit', [ApplicationStatus.DRAFT, ApplicationStatus.INFO_REQUESTED]],
    [
      'assign',
      [
        ApplicationStatus.SUBMITTED,
        ApplicationStatus.IN_REVIEW,
        ApplicationStatus.INFO_REQUESTED,
      ],
    ],
    ['decide', [ApplicationStatus.IN_REVIEW]],
    ['retryRisk', [ApplicationStatus.SUBMITTED]],
    ['completeRisk', [ApplicationStatus.SUBMITTED]],
  ] as const)('%s is allowed only from %j', (action, allowed) => {
    for (const status of ALL_STATUSES) {
      expect(canPerform(action, status)).toBe(
        (allowed as readonly ApplicationStatus[]).includes(status),
      );
    }
  });

  it('allows nothing at all on a final application', () => {
    for (const status of FINAL_STATUSES) {
      for (const action of ALL_ACTIONS) {
        expect(canPerform(action, status)).toBe(false);
      }
    }
  });

  it('maps each decision to its target state', () => {
    expect(DECISION_OUTCOME).toEqual({
      APPROVE: ApplicationStatus.APPROVED,
      REJECT: ApplicationStatus.REJECTED,
      REQUEST_INFO: ApplicationStatus.INFO_REQUESTED,
    });
  });

  it('throws 409 INVALID_STATE_TRANSITION with a readable message', () => {
    expect.assertions(3);
    try {
      assertCanPerform(
        'decide',
        ApplicationStatus.SUBMITTED,
        DecisionType.APPROVE,
      );
    } catch (error) {
      const appError = error as AppException;
      expect(appError.getStatus()).toBe(HttpStatus.CONFLICT);
      expect(appError.code).toBe('INVALID_STATE_TRANSITION');
      expect(appError.message).toBe(
        'Cannot approve an application in SUBMITTED state',
      );
    }
  });

  it('does not throw when the action is allowed', () => {
    expect(() =>
      assertCanPerform('edit', ApplicationStatus.DRAFT),
    ).not.toThrow();
  });
});

describe('isNoteRequired', () => {
  it.each([
    [DecisionType.APPROVE, RiskLevel.LOW, false],
    [DecisionType.APPROVE, RiskLevel.MEDIUM, false],
    [DecisionType.APPROVE, RiskLevel.HIGH, true],
    [DecisionType.REJECT, RiskLevel.LOW, true],
    [DecisionType.REQUEST_INFO, RiskLevel.LOW, true],
  ])('%s with %s risk -> %s', (decision, riskLevel, expected) => {
    expect(isNoteRequired(decision, riskLevel)).toBe(expected);
  });
});
