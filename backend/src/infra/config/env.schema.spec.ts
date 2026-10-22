import { validateEnv } from './env.schema.js';

describe('validateEnv', () => {
  it('applies defaults and coerces numbers', () => {
    const env = validateEnv({ API_PORT: '4100' });

    expect(env.API_PORT).toBe(4100);
    expect(env.COLLAB_PORT).toBe(4001);
    expect(env.NODE_ENV).toBe('development');
  });

  it('lists every invalid variable', () => {
    expect(() => validateEnv({ API_PORT: 'nope', NODE_ENV: 'staging' })).toThrow(
      /NODE_ENV[\s\S]*API_PORT|API_PORT[\s\S]*NODE_ENV/,
    );
  });
});
