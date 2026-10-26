// @vitest-environment node
import { NextRequest } from 'next/server';
import { getRedirectUrl, isRewrite } from 'next/experimental/testing/server';
import { sessionProxy } from './session';

const NOW = 1_800_000_000_000;
const options = { apiUrl: 'http://api.test', appOrigin: 'http://app.test', now: NOW };

const jwt = (exp: number) =>
  `h.${Buffer.from(JSON.stringify({ sub: 'u1', exp: exp / 1000 })).toString('base64url')}.s`;
const fresh = jwt(NOW + 10 * 60_000);
const expired = jwt(NOW - 1000);

const request = (path: string, cookies: Record<string, string> = {}) =>
  new NextRequest(`http://app.test${path}`, {
    headers: {
      cookie: Object.entries(cookies)
        .map(([name, value]) => `${name}=${value}`)
        .join('; '),
    },
  });

const refreshResponse = (ok: boolean) =>
  new Response(null, {
    status: ok ? 200 : 401,
    headers: ok
      ? [
          ['set-cookie', `access_token=${fresh}; Path=/; HttpOnly; SameSite=Lax`],
          ['set-cookie', 'refresh_token=rotated; Path=/; HttpOnly; SameSite=Lax'],
        ]
      : [],
  });

describe('sessionProxy', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('sends signed out visitors of private pages to the login page and back', async () => {
    const response = await sessionProxy(request('/w/1/d/2?x=1'), options);

    expect(getRedirectUrl(response)).toBe('http://app.test/login?next=%2Fw%2F1%2Fd%2F2%3Fx%3D1');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires a session to edit through a shared link', async () => {
    const response = await sessionProxy(request('/s/token'), options);

    expect(getRedirectUrl(response)).toBe('http://app.test/login?next=%2Fs%2Ftoken');
  });

  it('lets public pages through without a session', async () => {
    const response = await sessionProxy(request('/login'), options);

    expect(getRedirectUrl(response)).toBeNull();
    expect(isRewrite(response)).toBe(false);
  });

  it('passes requests with a fresh access token without calling the API', async () => {
    const response = await sessionProxy(request('/workspaces', { access_token: fresh }), options);

    expect(getRedirectUrl(response)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refreshes an expired access token and forwards the new cookies', async () => {
    fetchMock.mockResolvedValue(refreshResponse(true));

    const response = await sessionProxy(
      request('/workspaces', { access_token: expired, refresh_token: 'old' }),
      options,
    );

    expect(fetchMock).toHaveBeenCalledWith('http://api.test/api/auth/refresh', {
      method: 'POST',
      headers: { cookie: 'refresh_token=old', origin: 'http://app.test' },
      cache: 'no-store',
    });
    expect(getRedirectUrl(response)).toBeNull();
    expect(response.headers.getSetCookie()).toHaveLength(2);
    expect(response.headers.get('x-middleware-request-cookie')).toContain(`access_token=${fresh}`);
  });

  it('signs the user out when the refresh token is rejected', async () => {
    fetchMock.mockResolvedValue(refreshResponse(false));

    const response = await sessionProxy(request('/w/1', { refresh_token: 'revoked' }), options);

    expect(getRedirectUrl(response)).toBe('http://app.test/login?next=%2Fw%2F1');
    const cleared = response.headers.getSetCookie().join('\n');
    expect(cleared).toMatch(/access_token=;/);
    expect(cleared).toMatch(/refresh_token=;/);
  });

  it('treats an unreachable API as signed out instead of failing the request', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

    const response = await sessionProxy(request('/workspaces', { refresh_token: 't' }), options);

    expect(getRedirectUrl(response)).toBe('http://app.test/login?next=%2Fworkspaces');
  });

  it('keeps signed in users away from the auth pages, honouring a safe next', async () => {
    const signedIn = { access_token: fresh };

    expect(getRedirectUrl(await sessionProxy(request('/login', signedIn), options))).toBe(
      'http://app.test/workspaces',
    );
    expect(getRedirectUrl(await sessionProxy(request('/login?next=/w/9', signedIn), options))).toBe(
      'http://app.test/w/9',
    );
    expect(
      getRedirectUrl(
        await sessionProxy(request('/login?next=https://evil.example', signedIn), options),
      ),
    ).toBe('http://app.test/workspaces');
  });

  it('opens the workspaces list from the landing page when signed in', async () => {
    const response = await sessionProxy(request('/', { access_token: fresh }), options);

    expect(getRedirectUrl(response)).toBe('http://app.test/workspaces');
  });
});
