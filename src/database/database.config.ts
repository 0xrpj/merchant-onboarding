import { join } from 'node:path';
import type { DataSourceOptions } from 'typeorm';
import type { Env } from '@/config/env.schema';
import { SnakeNamingStrategy } from '@/database/snake-naming.strategy';

export type DatabaseEnv = Pick<
  Env,
  | 'POSTGRES_HOST'
  | 'POSTGRES_PORT'
  | 'POSTGRES_USER'
  | 'POSTGRES_PASSWORD'
  | 'POSTGRES_DB'
>;

// Running from TypeScript (Jest) loads .ts files; running compiled code (dist) loads .js.
// Never both, so the .d.ts files in dist are never mistaken for migrations.
const ext = __filename.endsWith('.ts') ? 'ts' : 'js';

/**
 * The one place the database connection is defined.
 * Used by the Nest app (DatabaseModule) and by the TypeORM CLI (data-source.ts).
 */
export const buildDataSourceOptions = (
  env: DatabaseEnv,
): DataSourceOptions => ({
  type: 'postgres',
  host: env.POSTGRES_HOST,
  port: env.POSTGRES_PORT,
  username: env.POSTGRES_USER,
  password: env.POSTGRES_PASSWORD,
  database: env.POSTGRES_DB,

  entities: [join(__dirname, '..', '**', `*.entity.${ext}`)],
  migrations: [join(__dirname, 'migrations', `*.${ext}`)],
  migrationsTableName: 'typeorm_migrations',
  // The schema changes only through reviewed migrations. Never auto-sync from entities.
  synchronize: false,
  namingStrategy: new SnakeNamingStrategy(),
  // UUID primary keys use gen_random_uuid(), built into Postgres 13+.
  // No extension to install, so the app's database user needs no superuser rights.
  uuidExtension: 'pgcrypto',
  installExtensions: false,

  // Shows in Postgres' pg_stat_activity, so our connections are easy to spot.
  applicationName: 'merchant-onboarding-api',
  // Give up connecting after 5 seconds instead of hanging.
  connectTimeoutMS: 5_000,
  extra: {
    // At most 10 open connections per app instance.
    max: 10,
    // Postgres cancels any single query that runs longer than 10 seconds.
    statement_timeout: 10_000,
  },
  logging: ['error', 'warn'],
});
