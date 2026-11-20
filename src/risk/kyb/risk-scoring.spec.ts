import {
  Industry,
  ProcessingChannel,
  RiskLevel,
} from '@/applications/application.enums';
import {
  HIGH_AVERAGE_TRANSACTION_MINOR,
  HIGH_MONTHLY_VOLUME_MINOR,
  riskLevelFor,
  scoreRisk,
} from '@/risk/kyb/risk-scoring';

// A low-risk café: NPR 1.5M a month, NPR 650 per sale, card terminals, 100% owned.
const cafe = {
  industry: Industry.FOOD_AND_BEVERAGE,
  expectedMonthlyVolumeMinor: 150_000_000,
  averageTransactionMinor: 65_000,
  channels: [ProcessingChannel.CARD_PRESENT],
  owners: [
    { fullName: 'Owner A', nationalId: '00-00-00-06789', ownershipPercent: 60 },
    { fullName: 'Owner B', nationalId: '00-00-00-01234', ownershipPercent: 40 },
  ],
};

describe('scoreRisk', () => {
  it('scores a café as LOW', () => {
    expect(scoreRisk(cafe)).toEqual({
      riskScore: 10,
      riskLevel: RiskLevel.LOW,
      reasons: ['Low-risk industry'],
    });
  });

  it('scores an online shop as MEDIUM', () => {
    const result = scoreRisk({
      ...cafe,
      industry: Industry.ECOMMERCE,
      channels: [ProcessingChannel.ECOMMERCE],
    });

    expect(result.riskScore).toBe(35);
    expect(result.riskLevel).toBe(RiskLevel.MEDIUM);
    expect(result.reasons).toEqual([
      'Medium-risk industry',
      'Card-not-present processing',
    ]);
  });

  it('scores high-volume digital goods sold online as HIGH', () => {
    const result = scoreRisk({
      ...cafe,
      industry: Industry.DIGITAL_GOODS,
      expectedMonthlyVolumeMinor: HIGH_MONTHLY_VOLUME_MINOR + 1,
      channels: [ProcessingChannel.RECURRING],
    });

    expect(result.riskScore).toBe(65);
    expect(result.riskLevel).toBe(RiskLevel.HIGH);
  });

  it('adds points for a large average ticket and undisclosed ownership', () => {
    const result = scoreRisk({
      ...cafe,
      averageTransactionMinor: HIGH_AVERAGE_TRANSACTION_MINOR + 1,
      owners: [
        {
          fullName: 'Owner A',
          nationalId: '00-00-00-06789',
          ownershipPercent: 51,
        },
      ],
    });

    expect(result.reasons).toEqual([
      'Low-risk industry',
      'High average transaction',
      'Ownership not fully disclosed',
    ]);
    expect(result.riskScore).toBe(30);
  });

  it('flags a simulated watchlist hit (national ID ending in 0000)', () => {
    const result = scoreRisk({
      ...cafe,
      owners: [
        {
          fullName: 'Owner A',
          nationalId: '11-22-33-40000',
          ownershipPercent: 100,
        },
      ],
    });

    expect(result.reasons).toContain('Owner matched a watchlist (simulated)');
    expect(result.riskLevel).toBe(RiskLevel.MEDIUM);
  });

  it('never goes above 100', () => {
    const result = scoreRisk({
      industry: Industry.DIGITAL_GOODS,
      expectedMonthlyVolumeMinor: HIGH_MONTHLY_VOLUME_MINOR + 1,
      averageTransactionMinor: HIGH_AVERAGE_TRANSACTION_MINOR + 1,
      channels: [ProcessingChannel.ECOMMERCE],
      owners: [
        { fullName: 'Owner A', nationalId: '0000', ownershipPercent: 10 },
      ],
    });

    expect(result.riskScore).toBe(100);
  });
});

describe('riskLevelFor', () => {
  it.each([
    [0, RiskLevel.LOW],
    [34, RiskLevel.LOW],
    [35, RiskLevel.MEDIUM],
    [64, RiskLevel.MEDIUM],
    [65, RiskLevel.HIGH],
    [100, RiskLevel.HIGH],
  ])('%i -> %s', (score, level) => {
    expect(riskLevelFor(score)).toBe(level);
  });
});
