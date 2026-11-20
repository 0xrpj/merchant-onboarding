import { setTimeout as sleep } from 'node:timers/promises';
import {
  type KybProvider,
  KybProviderError,
  type KybRequest,
  type KybResult,
} from '@/risk/kyb/kyb-provider';
import { scoreRisk } from '@/risk/kyb/risk-scoring';

/** A KYB provider the test controls: make it fail, slow it down, count calls. */
export class FakeKybProvider implements KybProvider {
  readonly name = 'FAKE_KYB';
  calls = 0;
  /** How many of the next calls fail. Infinity = all of them. */
  failNext = 0;
  /** Delay before answering, to hold two runs open at the same time. */
  delayMs = 0;

  async check(request: KybRequest): Promise<KybResult> {
    this.calls += 1;
    if (this.delayMs > 0) {
      await sleep(this.delayMs);
    }
    if (this.failNext > 0) {
      this.failNext -= 1;
      throw new KybProviderError('Fake provider failure');
    }
    return { providerReference: `FAKE-${this.calls}`, ...scoreRisk(request) };
  }

  reset(): void {
    this.calls = 0;
    this.failNext = 0;
    this.delayMs = 0;
  }
}
