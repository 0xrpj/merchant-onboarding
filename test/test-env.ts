import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

/**
 * Settings for e2e tests: your .env, but pointed at the test database
 * (merchant_onboarding_test), so tests can create and wipe data freely
 * without touching your dev data.
 */
export const applyTestEnv = (env: NodeJS.ProcessEnv): void => {
  const fromFile = existsSync('.env')
    ? parseEnv(readFileSync('.env', 'utf8'))
    : {};

  // Values already set in the shell win over .env.
  for (const [key, value] of Object.entries(fromFile)) {
    env[key] ??= value;
  }

  env.NODE_ENV = 'test';
  const database = env.POSTGRES_DB ?? 'merchant_onboarding';
  env.POSTGRES_DB = database.endsWith('_test') ? database : `${database}_test`;
};
