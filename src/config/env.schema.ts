import { z } from 'zod';

// Env vars always arrive as strings. z.coerce turns "5432" into the number 5432.
const port = z.coerce.number().int().min(1).max(65535);
const text = z.string().min(1, 'must not be empty');
const positiveInt = z.coerce.number().int().positive();
// "true"/"false" strings to a real boolean. (z.coerce.boolean would turn "false" into true.)
const flag = z.enum(['true', 'false']).transform((value) => value === 'true');

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
  // Same default as compose.yaml.
  POSTGRES_PORT: port.default(5433),
  POSTGRES_USER: text,
  POSTGRES_PASSWORD: text,
  POSTGRES_DB: text,

  REDIS_HOST: text,
  REDIS_PORT: port.default(6379),
  // Redis has numbered databases (0-15). Tests use their own so they never touch dev jobs.
  REDIS_DB: z.coerce.number().int().min(0).max(15).default(0),

  // --- Auth ---
  // Signs access tokens. 32+ characters, e.g. `openssl rand -base64 48`.
  JWT_ACCESS_SECRET: z
    .string()
    .min(32, 'must be at least 32 characters (openssl rand -base64 48)'),
  JWT_ACCESS_TTL_SECONDS: positiveInt.default(900),
  // bcrypt cost. 12 is a sensible production value; tests use a low one to stay fast.
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
  REFRESH_TOKEN_TTL_DAYS: positiveInt.default(7),
  // Login and refresh: this many attempts per IP per window, then 429.
  AUTH_RATE_LIMIT: positiveInt.default(5),
  AUTH_RATE_WINDOW_SECONDS: positiveInt.default(60),

  // --- Field encryption (owner national IDs) ---
  // 32 random bytes, base64-encoded: `openssl rand -base64 32`.
  FIELD_ENCRYPTION_KEY: z
    .string()
    .refine((value) => Buffer.from(value, 'base64').length === 32, {
      message: 'must be 32 bytes, base64-encoded (openssl rand -base64 32)',
    }),

  // --- Background risk check ---
  // false = this process only serves the API; a separate worker process runs the jobs.
  RUN_RISK_WORKER: flag.default(true),
  RISK_WORKER_CONCURRENCY: positiveInt.default(5),
  // Total tries per job, and the first retry delay (it doubles each time: 2s, 4s, 8s...).
  RISK_JOB_ATTEMPTS: positiveInt.default(4),
  RISK_JOB_BACKOFF_MS: positiveInt.default(2000),
  // The simulated KYB provider: share of calls that fail, and the slowest response.
  RISK_PROVIDER_FAILURE_RATE: z.coerce.number().min(0).max(1).default(0.2),
  RISK_PROVIDER_MAX_DELAY_MS: z.coerce.number().int().min(0).default(1500),
});

/** The validated settings, with defaults applied and numbers already converted. */
export type Env = z.infer<typeof envSchema>;
