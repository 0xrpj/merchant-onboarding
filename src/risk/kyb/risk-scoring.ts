import {
  Industry,
  ProcessingChannel,
  RiskLevel,
} from '@/applications/application.enums';
import { totalOwnershipPercent } from '@/applications/domain/owner-rules';
import { lastFour } from '@/common/masking/masking';
import type { KybRequest } from '@/risk/kyb/kyb-provider';

/**
 * The simulated provider's scoring. Pure and deterministic, so it is easy to
 * test and to explain. 0 is the safest score, 100 the riskiest.
 */

const BASE_SCORE = 10;

const INDUSTRY_POINTS: Record<Industry, number> = {
  [Industry.FOOD_AND_BEVERAGE]: 0,
  [Industry.RETAIL]: 5,
  [Industry.OTHER]: 10,
  [Industry.ECOMMERCE]: 15,
  [Industry.TRAVEL]: 20,
  [Industry.DIGITAL_GOODS]: 25,
};

/** NPR 5,000,000 per month, in paisa. */
export const HIGH_MONTHLY_VOLUME_MINOR = 500_000_000;
/** NPR 50,000 per transaction, in paisa. */
export const HIGH_AVERAGE_TRANSACTION_MINOR = 5_000_000;
/** Simulated watchlist: national IDs ending in 0000 "match". Test data only. */
const WATCHLIST_SUFFIX = '0000';

const CARD_NOT_PRESENT: readonly ProcessingChannel[] = [
  ProcessingChannel.ECOMMERCE,
  ProcessingChannel.RECURRING,
];

/** Below 35 LOW, below 65 MEDIUM, otherwise HIGH. */
export const riskLevelFor = (score: number): RiskLevel =>
  score < 35 ? RiskLevel.LOW : score < 65 ? RiskLevel.MEDIUM : RiskLevel.HIGH;

export type RiskScore = {
  riskScore: number;
  riskLevel: RiskLevel;
  reasons: string[];
};

export const scoreRisk = (
  input: Pick<
    KybRequest,
    | 'industry'
    | 'expectedMonthlyVolumeMinor'
    | 'averageTransactionMinor'
    | 'channels'
    | 'owners'
  >,
): RiskScore => {
  let score = BASE_SCORE;
  const reasons: string[] = [];

  const industryPoints = INDUSTRY_POINTS[input.industry];
  score += industryPoints;
  reasons.push(
    industryPoints >= 20
      ? 'High-risk industry'
      : industryPoints <= 5
        ? 'Low-risk industry'
        : 'Medium-risk industry',
  );

  if (input.expectedMonthlyVolumeMinor > HIGH_MONTHLY_VOLUME_MINOR) {
    score += 20;
    reasons.push('Monthly volume above threshold');
  }

  if (input.averageTransactionMinor > HIGH_AVERAGE_TRANSACTION_MINOR) {
    score += 10;
    reasons.push('High average transaction');
  }

  if (input.channels.some((channel) => CARD_NOT_PRESENT.includes(channel))) {
    score += 10;
    reasons.push('Card-not-present processing');
  }

  if (totalOwnershipPercent(input.owners) < 100) {
    score += 10;
    reasons.push('Ownership not fully disclosed');
  }

  if (
    input.owners.some(
      (owner) => lastFour(owner.nationalId) === WATCHLIST_SUFFIX,
    )
  ) {
    score += 40;
    reasons.push('Owner matched a watchlist (simulated)');
  }

  const riskScore = Math.min(100, score);
  return { riskScore, riskLevel: riskLevelFor(riskScore), reasons };
};
