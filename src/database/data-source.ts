import { existsSync } from 'node:fs';
import { DataSource } from 'typeorm';
import { envSchema } from '@/config/env.schema';
import { buildDataSourceOptions } from '@/database/database.config';

/**
 * Entry point for the TypeORM CLI (migration:generate, migration:run, ...).
 * The CLI runs outside Nest, so it reads and validates .env itself.
 * Variables already set in the shell win over .env, e.g.
 *   POSTGRES_DB=merchant_onboarding_test npm run migration:run
 */
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

export default new DataSource(
  buildDataSourceOptions(envSchema.parse(process.env)),
);
