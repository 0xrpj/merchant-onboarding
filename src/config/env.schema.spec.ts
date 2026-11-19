import { envSchema } from '@/config/env.schema';

// Only the required settings. Everything else should fall back to its default.
const minimalEnv = {
  POSTGRES_HOST: 'localhost',
  POSTGRES_USER: 'merchant',
  POSTGRES_PASSWORD: 'not-a-real-password',
  POSTGRES_DB: 'merchant_onboarding',
  REDIS_HOST: 'localhost',
};

describe('envSchema', () => {
  it('applies defaults for optional settings', () => {
    const env = envSchema.parse(minimalEnv);

    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.POSTGRES_PORT).toBe(5432);
    expect(env.REDIS_PORT).toBe(6379);
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
