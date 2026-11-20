import {
  assertOwnerRules,
  ownerRuleViolations,
  totalOwnershipPercent,
} from '@/applications/domain/owner-rules';
import { AppException } from '@/common/errors/app.exception';

const owner = (ownershipPercent: number, isPrimaryContact = false) => ({
  ownershipPercent,
  isPrimaryContact,
});

describe('owner rules', () => {
  it('accepts a valid list', () => {
    expect(ownerRuleViolations([owner(60, true), owner(40)])).toEqual([]);
  });

  it('accepts less than 100% (not every share has to be listed)', () => {
    expect(ownerRuleViolations([owner(25, true)])).toEqual([]);
  });

  it('adds up decimals exactly: 33.33 + 33.33 + 33.34 = 100', () => {
    const owners = [owner(33.33, true), owner(33.33), owner(33.34)];

    expect(totalOwnershipPercent(owners)).toBe(100);
    expect(ownerRuleViolations(owners)).toEqual([]);
  });

  it('rejects more than 100% in total', () => {
    expect(ownerRuleViolations([owner(60, true), owner(40.01)])).toEqual([
      "Total ownership is 100.01%, it can't be more than 100%",
    ]);
  });

  it('rejects no owners and more than 10 owners', () => {
    const eleven = [
      owner(5, true),
      ...Array.from({ length: 10 }, () => owner(5)),
    ];

    expect(ownerRuleViolations([])).toContain(
      'An application needs 1 to 10 owners (got 0)',
    );
    expect(ownerRuleViolations(eleven)).toContain(
      'An application needs 1 to 10 owners (got 11)',
    );
  });

  it.each([
    [[owner(50), owner(50)], 0],
    [[owner(50, true), owner(50, true)], 2],
  ])('requires exactly one primary contact', (owners, found) => {
    expect(ownerRuleViolations(owners)).toEqual([
      `Exactly one owner must be the primary contact (got ${found})`,
    ]);
  });

  it('assertOwnerRules throws 400 listing every problem under "owners"', () => {
    expect.assertions(2);
    try {
      assertOwnerRules([owner(80), owner(30)]);
    } catch (error) {
      const appError = error as AppException;
      expect(appError.getStatus()).toBe(400);
      expect(appError.details).toEqual([
        {
          field: 'owners',
          messages: [
            "Total ownership is 110%, it can't be more than 100%",
            'Exactly one owner must be the primary contact (got 0)',
          ],
        },
      ]);
    }
  });
});
