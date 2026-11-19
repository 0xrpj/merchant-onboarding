import { z } from 'zod';

// Env vars always arrive as strings. z.coerce turns "5432" into the number 5432.
const port = z.coerce.number().int().min(1).max(65535);
const text = z.string().min(1, 'must not be empty');

/**
 * Every setting the app reads from the environment.
 * The app refuses to start if any of these is missing or invalid.
 */
export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: port.default(3000),

  POSTGRES_HOST: text,
  POSTGRES_PORT: port.default(5432),
  POSTGRES_USER: text,
  POSTGRES_PASSWORD: text,
  POSTGRES_DB: text,

  REDIS_HOST: text,
  REDIS_PORT: port.default(6379),
});

/** The validated settings, with defaults applied and numbers already converted. */
export type Env = z.infer<typeof envSchema>;
