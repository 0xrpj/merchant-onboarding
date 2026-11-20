/** Fake data only: example domains, made-up phone numbers and IDs. */

export const ownerBody = (overrides: Record<string, unknown> = {}) => ({
  fullName: 'Owner A',
  email: 'owner.a@himalbrew.example',
  phone: '+9779800000001',
  ownershipPercent: 60,
  isPrimaryContact: true,
  nationalId: '00-00-00-06789',
  ...overrides,
});

export const secondOwnerBody = (overrides: Record<string, unknown> = {}) =>
  ownerBody({
    fullName: 'Owner B',
    email: 'owner.b@himalbrew.example',
    phone: '+9779800000002',
    ownershipPercent: 40,
    isPrimaryContact: false,
    nationalId: '00-00-00-01234',
    ...overrides,
  });

export const processingBody = (overrides: Record<string, unknown> = {}) => ({
  expectedMonthlyVolumeMinor: 150_000_000,
  averageTransactionMinor: 65_000,
  currency: 'NPR',
  channels: ['CARD_PRESENT'],
  ...overrides,
});

/** A valid create request. Scores LOW (café, card terminals, 100% owned). */
export const applicationBody = (overrides: Record<string, unknown> = {}) => ({
  businessName: 'Himal Brew Café',
  legalBusinessName: 'Himal Brew Pvt. Ltd.',
  businessType: 'PRIVATE_LIMITED',
  industry: 'FOOD_AND_BEVERAGE',
  registrationNumber: 'REG-111',
  processing: processingBody(),
  owners: [ownerBody(), secondOwnerBody()],
  ...overrides,
});

/** Scores HIGH: digital goods, NPR 6M a month, sold online. */
export const highRiskOverrides = {
  industry: 'DIGITAL_GOODS',
  processing: processingBody({
    expectedMonthlyVolumeMinor: 600_000_000,
    channels: ['ECOMMERCE'],
  }),
};
