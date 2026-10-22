import { isRequestFromAllowedOrigin } from './origin-policy.js';

const allowed = ['http://localhost:3000'];
const check = (method: string, origin: string | undefined, hasSessionCookie: boolean) =>
  isRequestFromAllowedOrigin({ method, origin, hasSessionCookie }, allowed);

describe('isRequestFromAllowedOrigin', () => {
  it.each(['GET', 'HEAD', 'OPTIONS', 'get'])('lets safe method %s through', (method) => {
    expect(check(method, 'https://evil.example', true)).toBe(true);
  });

  it('accepts mutations from an allowed origin', () => {
    expect(check('POST', 'http://localhost:3000', true)).toBe(true);
  });

  it('rejects mutations from a foreign origin even without a session', () => {
    expect(check('POST', 'https://evil.example', true)).toBe(false);
    expect(check('POST', 'https://evil.example', false)).toBe(false);
  });

  it('rejects cookie-authenticated mutations without an origin', () => {
    expect(check('DELETE', undefined, true)).toBe(false);
  });

  it('accepts server-to-server mutations without cookies or origin', () => {
    expect(check('POST', undefined, false)).toBe(true);
  });
});
