import './register-paths';
import { DataSource } from 'typeorm';
import { envSchema } from '@/config/env.schema';
import { buildDataSourceOptions } from '@/database/database.config';
import { applyTestEnv } from './test-env';

/**
 * Jest runs this once before all e2e tests (see "globalSetup" in jest-e2e.json):
 * it brings the test database up to the latest migration.
 */
export default async function globalSetup(): Promise<void> {
  applyTestEnv(process.env);

  const dataSource = new DataSource(
    buildDataSourceOptions(envSchema.parse(process.env)),
  );

  await dataSource.initialize();
  try {
    const applied = await dataSource.runMigrations({ transaction: 'each' });
    if (applied.length > 0) {
      console.log(`\nTest database: applied ${applied.length} migration(s).`);
    }
  } finally {
    await dataSource.destroy();
  }
}
