import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

/**
 * Settings for e2e tests: your .env, but pointed at the test database
 * (merchant_onboarding_test) and Redis database 1, so tests can create and
 * wipe data freely without touching your dev data or dev jobs.
 */
export const applyTestEnv = (env: NodeJS.ProcessEnv): void => {
  const fromFile = existsSync('.env')
    ? parseEnv(readFileSync('.env', 'utf8'))
    : {};

  // Values already set in the shell win over .env.
  for (const [key, value] of Object.entries(fromFile)) {
    env[key] ??= value;
  }

  // Without a .env (e.g. in CI), throwaway keys that exist only for this run.
  env.JWT_ACCESS_SECRET ??= randomBytes(48).toString('base64');
  env.FIELD_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');

  env.NODE_ENV = 'test';
  const database = env.POSTGRES_DB ?? 'merchant_onboarding';
  env.POSTGRES_DB = database.endsWith('_test') ? database : `${database}_test`;
  env.REDIS_DB = '1';

  // Fast and predictable: cheap bcrypt, no random provider failures or delays,
  // quick retries. Tests that need failures use a fake provider instead.
  env.BCRYPT_ROUNDS = '4';
  env.AUTH_RATE_LIMIT = '30';
  env.RISK_JOB_ATTEMPTS = '3';
  env.RISK_JOB_BACKOFF_MS = '50';
  env.RISK_PROVIDER_FAILURE_RATE = '0';
  env.RISK_PROVIDER_MAX_DELAY_MS = '0';
  env.RUN_RISK_WORKER = 'true';
};
