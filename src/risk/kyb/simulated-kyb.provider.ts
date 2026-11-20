import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '@/config/env.schema';
import {
  type KybProvider,
  KybProviderError,
  type KybRequest,
  type KybResult,
} from '@/risk/kyb/kyb-provider';
import { scoreRisk } from '@/risk/kyb/risk-scoring';
import { SIMULATED_KYB_PROVIDER } from '@/risk/risk-queue.constants';

/**
 * Behaves like a real KYB provider: answers after a random delay, and fails
 * some of the time (RISK_PROVIDER_FAILURE_RATE), so retries actually happen.
 */
@Injectable()
export class SimulatedKybProvider implements KybProvider {
  readonly name = SIMULATED_KYB_PROVIDER;
  private readonly failureRate: number;
  private readonly maxDelayMs: number;

  constructor(config: ConfigService<Env, true>) {
    this.failureRate = config.get('RISK_PROVIDER_FAILURE_RATE', {
      infer: true,
    });
    this.maxDelayMs = config.get('RISK_PROVIDER_MAX_DELAY_MS', { infer: true });
  }

  async check(request: KybRequest): Promise<KybResult> {
    await sleep(Math.floor(Math.random() * (this.maxDelayMs + 1)));

    if (Math.random() < this.failureRate) {
      throw new KybProviderError('Simulated KYB provider is unavailable');
    }

    return { providerReference: `SIM-${randomUUID()}`, ...scoreRisk(request) };
  }
}
