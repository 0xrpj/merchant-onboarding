import './register-paths';
import Redis from 'ioredis';
import { DataSource } from 'typeorm';
import { envSchema } from '@/config/env.schema';
import { buildDataSourceOptions } from '@/database/database.config';
import { applyTestEnv } from './test-env';

/**
 * Jest runs this once before all e2e tests (see "globalSetup" in jest-e2e.json):
 * it brings the test database up to the latest migration and empties the
 * test Redis database (leftover jobs from an earlier run).
 */
export default async function globalSetup(): Promise<void> {
  applyTestEnv(process.env);

  const env = envSchema.parse(process.env);
  const dataSource = new DataSource(buildDataSourceOptions(env));

  await dataSource.initialize();
  try {
    const applied = await dataSource.runMigrations({ transaction: 'each' });
    if (applied.length > 0) {
      console.log(`\nTest database: applied ${applied.length} migration(s).`);
    }
  } finally {
    await dataSource.destroy();
  }

  const redis = new Redis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    db: env.REDIS_DB,
  });
  try {
    await redis.flushdb();
  } finally {
    redis.disconnect();
  }
}
