import { validateEnv } from './env.schema.js';

const validEnv = {
  DATABASE_URL: 'postgresql://collab:collab@localhost:5432/collab_docs',
  REDIS_URL: 'redis://localhost:6380',
};

describe('validateEnv', () => {
  it('applies defaults and coerces numbers', () => {
    const env = validateEnv({ ...validEnv, API_PORT: '4100' });

    expect(env.API_PORT).toBe(4100);
    expect(env.COLLAB_PORT).toBe(4001);
    expect(env.NODE_ENV).toBe('development');
  });

  it('lists every invalid variable', () => {
    expect(() => validateEnv({ ...validEnv, DATABASE_URL: 'nope', REDIS_URL: 'nope' })).toThrow(
      /DATABASE_URL[\s\S]*REDIS_URL/,
    );
  });
});
