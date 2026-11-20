import type {
  BusinessType,
  Industry,
  ProcessingChannel,
  RiskLevel,
} from '@/applications/application.enums';

/** Injection token. Tests swap in a fake provider with overrideProvider(KYB_PROVIDER). */
export const KYB_PROVIDER = Symbol('KYB_PROVIDER');

export type KybOwner = {
  fullName: string;
  /** Decrypted. Exists only in memory, only for the provider call. Never logged. */
  nationalId: string;
  ownershipPercent: number;
};

/** What we send to the KYB (Know Your Business) provider. */
export type KybRequest = {
  businessName: string;
  legalBusinessName: string;
  registrationNumber: string;
  businessType: BusinessType;
  industry: Industry;
  expectedMonthlyVolumeMinor: number;
  averageTransactionMinor: number;
  channels: ProcessingChannel[];
  owners: KybOwner[];
};

export type KybResult = {
  providerReference: string;
  riskScore: number;
  riskLevel: RiskLevel;
  reasons: string[];
};

/**
 * A KYB provider. A real one would be an HTTP client; this project uses a
 * simulated one. Swapping providers means writing another class with this shape.
 */
export interface KybProvider {
  readonly name: string;
  check(request: KybRequest): Promise<KybResult>;
}

/** A failure worth retrying (timeout, provider error). Its message is safe to store. */
export class KybProviderError extends Error {
  override readonly name = 'KybProviderError';
}
