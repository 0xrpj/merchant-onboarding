import { HttpStatus } from '@nestjs/common';
import { AppException } from '@/common/errors/app.exception';
import { ErrorCode } from '@/common/errors/error-codes';

export const MIN_OWNERS = 1;
export const MAX_OWNERS = 10;

type OwnerShare = { ownershipPercent: number; isPrimaryContact: boolean };

/**
 * Total ownership in percent. Added up in hundredths (whole numbers), so
 * 33.33 + 33.33 + 33.34 is exactly 100 with no floating-point error.
 */
export const totalOwnershipPercent = (owners: readonly OwnerShare[]): number =>
  owners.reduce(
    (sum, owner) => sum + Math.round(owner.ownershipPercent * 100),
    0,
  ) / 100;

/** What's wrong with an owner list. Empty means valid. */
export const ownerRuleViolations = (
  owners: readonly OwnerShare[],
): string[] => {
  const problems: string[] = [];

  if (owners.length < MIN_OWNERS || owners.length > MAX_OWNERS) {
    problems.push(
      `An application needs ${MIN_OWNERS} to ${MAX_OWNERS} owners (got ${owners.length})`,
    );
  }

  const total = totalOwnershipPercent(owners);
  if (total > 100) {
    problems.push(`Total ownership is ${total}%, it can't be more than 100%`);
  }

  const primaryContacts = owners.filter(
    (owner) => owner.isPrimaryContact,
  ).length;
  if (primaryContacts !== 1) {
    problems.push(
      `Exactly one owner must be the primary contact (got ${primaryContacts})`,
    );
  }

  return problems;
};

/** 400 VALIDATION_FAILED, listing every broken rule under the field "owners". */
export const assertOwnerRules = (owners: readonly OwnerShare[]): void => {
  const problems = ownerRuleViolations(owners);
  if (problems.length > 0) {
    throw new AppException(
      HttpStatus.BAD_REQUEST,
      ErrorCode.VALIDATION_FAILED,
      'Owner list is invalid',
      [{ field: 'owners', messages: problems }],
    );
  }
};
