import { existsSync } from 'node:fs';
import { DataSource } from 'typeorm';
import { z } from 'zod';
import { hashPassword } from '@/auth/password';
import { envSchema } from '@/config/env.schema';
import { buildDataSourceOptions } from '@/database/database.config';
import { User } from '@/users/user.entity';
import { UserRole } from '@/users/user-role.enum';

/**
 * Creates the demo staff accounts: npm run seed
 * Every account gets the password from SEED_USER_PASSWORD in .env.
 * Safe to run again: existing accounts (matched by email) are updated, not duplicated.
 * All names and emails are fake (example.com is reserved for examples).
 */
const DEMO_USERS: ReadonlyArray<
  Pick<User, 'email' | 'fullName' | 'role' | 'isActive'>
> = [
  {
    email: 'maya.admin@example.com',
    fullName: 'Maya Admin',
    role: UserRole.ADMIN,
    isActive: true,
  },
  {
    email: 'ram.reviewer@example.com',
    fullName: 'Ram Reviewer',
    role: UserRole.REVIEWER,
    isActive: true,
  },
  {
    email: 'gita.reviewer@example.com',
    fullName: 'Gita Reviewer',
    role: UserRole.REVIEWER,
    isActive: true,
  },
  {
    email: 'sita.sales@example.com',
    fullName: 'Sita Sales',
    role: UserRole.SALES,
    isActive: true,
  },
  {
    email: 'hari.sales@example.com',
    fullName: 'Hari Sales',
    role: UserRole.SALES,
    isActive: true,
  },
  // Can't log in or be assigned. Useful for trying the INVALID_REVIEWER case.
  {
    email: 'old.reviewer@example.com',
    fullName: 'Former Reviewer',
    role: UserRole.REVIEWER,
    isActive: false,
  },
];

// Only the settings the seed needs, plus the demo password.
const seedEnvSchema = envSchema
  .pick({
    POSTGRES_HOST: true,
    POSTGRES_PORT: true,
    POSTGRES_USER: true,
    POSTGRES_PASSWORD: true,
    POSTGRES_DB: true,
    BCRYPT_ROUNDS: true,
  })
  .extend({
    SEED_USER_PASSWORD: z
      .string()
      .min(12, 'must be at least 12 characters (openssl rand -base64 18)'),
  });

async function seed(): Promise<void> {
  if (existsSync('.env')) {
    process.loadEnvFile('.env');
  }
  const env = seedEnvSchema.parse(process.env);

  const dataSource = new DataSource(buildDataSourceOptions(env));
  await dataSource.initialize();
  try {
    const passwordHash = await hashPassword(
      env.SEED_USER_PASSWORD,
      env.BCRYPT_ROUNDS,
    );
    await dataSource.getRepository(User).upsert(
      DEMO_USERS.map((user) => ({ ...user, passwordHash })),
      ['email'],
    );

    console.table(
      DEMO_USERS.map(({ email, role, isActive }) => ({
        email,
        role,
        isActive,
      })),
    );
    console.log(
      'Password for all accounts: the SEED_USER_PASSWORD in your .env',
    );
  } finally {
    await dataSource.destroy();
  }
}

seed().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
