import { extractAccessToken, extractBearerToken } from './jwt-auth.guard.js';

describe('extractBearerToken', () => {
  it('reads a bearer token case-insensitively', () => {
    expect(extractBearerToken('Bearer abc.def')).toBe('abc.def');
    expect(extractBearerToken('bearer abc.def')).toBe('abc.def');
  });

  it.each([undefined, '', 'Basic abc', 'Bearer', 'Bearer '])('ignores %s', (header) => {
    expect(extractBearerToken(header)).toBeUndefined();
  });
});

describe('extractAccessToken', () => {
  it('prefers the authorization header over the cookie', () => {
    expect(
      extractAccessToken({
        headers: { authorization: 'Bearer from-header' },
        cookies: { access_token: 'from-cookie' },
      }),
    ).toBe('from-header');
  });

  it('falls back to the access cookie', () => {
    expect(extractAccessToken({ headers: {}, cookies: { access_token: 'from-cookie' } })).toBe(
      'from-cookie',
    );
  });

  it('returns undefined without credentials', () => {
    expect(extractAccessToken({ headers: {}, cookies: {} })).toBeUndefined();
  });
});
