import { type NextRequest, NextResponse } from 'next/server';
import { routes } from '@/shared/config';
import { isTokenFresh, loginPath, safeNextPath } from '@/shared/lib';

export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';
const EXPIRY_LEEWAY_MS = 10_000;

const PROTECTED = [/^\/workspaces(\/|$)/, /^\/w\//, /^\/s\//, /^\/invitations(\/|$)/];
const GUEST_ONLY = [routes.login, routes.register];

export interface SessionProxyOptions {
  apiUrl: string;
  appOrigin: string;
  now?: number;
}

interface RefreshedSession {
  cookies: Map<string, string>;
  setCookies: string[];
}

const isProtectedPath = (path: string) => PROTECTED.some((pattern) => pattern.test(path));

function parseSetCookies(setCookies: string[]) {
  const cookies = new Map<string, string>();
  for (const header of setCookies) {
    const [pair] = header.split(';');
    const separator = pair.indexOf('=');
    if (separator > 0) {
      cookies.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim());
    }
  }
  return cookies;
}

async function refresh(
  refreshToken: string,
  { apiUrl, appOrigin }: SessionProxyOptions,
): Promise<RefreshedSession | null> {
  try {
    const response = await fetch(`${apiUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { cookie: `${REFRESH_COOKIE}=${refreshToken}`, origin: appOrigin },
      cache: 'no-store',
    });
    if (!response.ok) {
      return null;
    }
    const setCookies = response.headers.getSetCookie();
    const cookies = parseSetCookies(setCookies);
    return cookies.has(ACCESS_COOKIE) ? { cookies, setCookies } : null;
  } catch {
    return null;
  }
}

function withSession(response: NextResponse, session: RefreshedSession | null, clear: boolean) {
  for (const header of session?.setCookies ?? []) {
    response.headers.append('set-cookie', header);
  }
  if (clear) {
    response.cookies.delete(ACCESS_COOKIE);
    response.cookies.delete(REFRESH_COOKIE);
  }
  return response;
}

export async function sessionProxy(request: NextRequest, options: SessionProxyOptions) {
  const { pathname, search } = request.nextUrl;
  const access = request.cookies.get(ACCESS_COOKIE)?.value;
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  const accessFresh = isTokenFresh(access, options.now ?? Date.now(), EXPIRY_LEEWAY_MS);

  const session = !accessFresh && refreshToken ? await refresh(refreshToken, options) : null;
  const signedIn = accessFresh || session !== null;
  const staleCookies = !signedIn && (access !== undefined || refreshToken !== undefined);
  const redirect = (path: string) =>
    withSession(NextResponse.redirect(new URL(path, request.url)), session, staleCookies);

  if (!signedIn && isProtectedPath(pathname)) {
    return redirect(loginPath(`${pathname}${search}`));
  }
  if (signedIn && GUEST_ONLY.some((page) => page === pathname)) {
    return redirect(safeNextPath(request.nextUrl.searchParams.get('next')));
  }
  if (signedIn && pathname === routes.home) {
    return redirect(routes.workspaces);
  }

  if (!session) {
    return withSession(NextResponse.next(), null, staleCookies);
  }
  const headers = new Headers(request.headers);
  const forwarded = new Map(request.cookies.getAll().map(({ name, value }) => [name, value]));
  for (const [name, value] of session.cookies) {
    forwarded.set(name, value);
  }
  headers.set('cookie', [...forwarded].map(([name, value]) => `${name}=${value}`).join('; '));
  return withSession(NextResponse.next({ request: { headers } }), session, false);
}
