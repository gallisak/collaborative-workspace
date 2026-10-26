import { isTokenFresh, tokenExpiresAt } from './jwt';

const token = (payload: object) =>
  `header.${btoa(JSON.stringify(payload)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')}.signature`;

describe('tokenExpiresAt', () => {
  it('reads the expiry of a JWT', () => {
    expect(tokenExpiresAt(token({ sub: 'u1', exp: 1_800_000_000 }))).toBe(1_800_000_000_000);
  });

  it.each([undefined, '', 'not-a-jwt', 'a.%%%.c', token({ sub: 'u1' })])(
    'returns null for %s',
    (value) => {
      expect(tokenExpiresAt(value)).toBeNull();
    },
  );
});

describe('isTokenFresh', () => {
  const exp = 1_800_000_000;
  it('treats tokens about to expire as stale', () => {
    expect(isTokenFresh(token({ exp }), exp * 1000 - 60_000, 10_000)).toBe(true);
    expect(isTokenFresh(token({ exp }), exp * 1000 - 5_000, 10_000)).toBe(false);
  });
});
