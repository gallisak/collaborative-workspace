import { envFilePaths, envProfile, validateEnv } from './env.schema.js';

const validEnv = {
  DATABASE_URL: 'postgresql://collab:collab@localhost:5432/collab_docs',
  REDIS_URL: 'redis://localhost:6380',
  S3_ACCESS_KEY: 'minioadmin',
  S3_SECRET_KEY: 'minioadmin',
  S3_BUCKET: 'collab-docs',
  JWT_ACCESS_SECRET: 'a'.repeat(16),
  REFRESH_TOKEN_SECRET: 'b'.repeat(16),
  REVALIDATE_SECRET: 'c'.repeat(16),
  BILLING_WEBHOOK_SECRET: 'd'.repeat(16),
};

describe('validateEnv', () => {
  it('applies defaults and coerces numbers', () => {
    const env = validateEnv({ ...validEnv, API_PORT: '4100' });

    expect(env.API_PORT).toBe(4100);
    expect(env.COLLAB_PORT).toBe(4001);
    expect(env.NODE_ENV).toBe('development');
    expect(env.JWT_ACCESS_TTL).toBe('15m');
  });

  it('lists every invalid variable', () => {
    expect(() =>
      validateEnv({ ...validEnv, DATABASE_URL: 'nope', JWT_ACCESS_SECRET: 'short' }),
    ).toThrow(/DATABASE_URL[\s\S]*JWT_ACCESS_SECRET/);
  });

  it('rejects malformed durations', () => {
    expect(() => validateEnv({ ...validEnv, REFRESH_TOKEN_TTL: 'forever' })).toThrow(
      /REFRESH_TOKEN_TTL/,
    );
  });
});

describe('validateEnv in production', () => {
  const strong = (char: string) => char.repeat(40);

  it('rejects placeholder and short secrets', () => {
    expect(() =>
      validateEnv({
        ...validEnv,
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: 'dev-access-secret-change-me-please-now',
        REFRESH_TOKEN_SECRET: 'too-short-secret',
      }),
    ).toThrow(/JWT_ACCESS_SECRET[\s\S]*REFRESH_TOKEN_SECRET/);
  });

  it('accepts strong secrets', () => {
    const env = validateEnv({
      ...validEnv,
      NODE_ENV: 'production',
      JWT_ACCESS_SECRET: strong('x'),
      REFRESH_TOKEN_SECRET: strong('y'),
      REVALIDATE_SECRET: strong('z'),
      BILLING_WEBHOOK_SECRET: strong('w'),
    });

    expect(env.NODE_ENV).toBe('production');
  });
});

describe('envProfile', () => {
  it('prefers APP_ENV so staging can run with NODE_ENV=production', () => {
    expect(envProfile({ APP_ENV: 'staging', NODE_ENV: 'production' })).toBe('staging');
    expect(envFilePaths('staging')[0]).toMatch(/\.env\.staging$/);
  });

  it('falls back to NODE_ENV and then to development', () => {
    expect(envProfile({ NODE_ENV: 'test' })).toBe('test');
    expect(envProfile({})).toBe('development');
  });
});
