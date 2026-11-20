import { envSchema } from '@/config/env.schema';

// Only the required settings. Everything else should fall back to its default.
const minimalEnv = {
  POSTGRES_HOST: 'localhost',
  POSTGRES_USER: 'merchant',
  POSTGRES_PASSWORD: 'not-a-real-password',
  POSTGRES_DB: 'merchant_onboarding',
  REDIS_HOST: 'localhost',
  // Obviously fake values, only for this test.
  JWT_ACCESS_SECRET: 'unit-test-only-secret-'.padEnd(40, 'x'),
  FIELD_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'),
};

describe('envSchema', () => {
  it('applies defaults for optional settings', () => {
    const env = envSchema.parse(minimalEnv);

    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.POSTGRES_PORT).toBe(5433);
    expect(env.REDIS_PORT).toBe(6379);
    expect(env.RUN_RISK_WORKER).toBe(true);
    expect(env.RISK_JOB_ATTEMPTS).toBe(4);
  });

  it('turns RUN_RISK_WORKER="false" into false (not true, like z.coerce.boolean would)', () => {
    const env = envSchema.parse({ ...minimalEnv, RUN_RISK_WORKER: 'false' });

    expect(env.RUN_RISK_WORKER).toBe(false);
  });

  it('rejects a JWT secret shorter than 32 characters', () => {
    const result = envSchema.safeParse({
      ...minimalEnv,
      JWT_ACCESS_SECRET: 'too-short',
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['JWT_ACCESS_SECRET']);
  });

  it('rejects an encryption key that is not 32 bytes', () => {
    const result = envSchema.safeParse({
      ...minimalEnv,
      FIELD_ENCRYPTION_KEY: Buffer.alloc(16).toString('base64'),
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['FIELD_ENCRYPTION_KEY']);
  });

  it('converts numeric strings to numbers', () => {
    const env = envSchema.parse({ ...minimalEnv, PORT: '4000' });

    expect(env.PORT).toBe(4000);
  });

  it('rejects a missing required setting', () => {
    const { POSTGRES_HOST: _removed, ...withoutHost } = minimalEnv;

    const result = envSchema.safeParse(withoutHost);

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['POSTGRES_HOST']);
  });

  it('rejects an empty password (the value in .env.example)', () => {
    const result = envSchema.safeParse({
      ...minimalEnv,
      POSTGRES_PASSWORD: '',
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['POSTGRES_PASSWORD']);
  });

  it.each(['abc', '0', '70000'])('rejects PORT=%s', (value) => {
    const result = envSchema.safeParse({ ...minimalEnv, PORT: value });

    expect(result.success).toBe(false);
  });

  it('rejects an unknown NODE_ENV', () => {
    const result = envSchema.safeParse({ ...minimalEnv, NODE_ENV: 'staging' });

    expect(result.success).toBe(false);
  });
});
