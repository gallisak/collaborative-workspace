import { routes } from '../config/routes';

const BASE = 'http://app.invalid';
const AUTH_PAGES = [routes.login, routes.register];

export function safeNextPath(
  value: string | null | undefined,
  fallback: string = routes.workspaces,
) {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return fallback;
  }
  const url = new URL(value, BASE);
  if (url.origin !== BASE || AUTH_PAGES.some((page) => url.pathname === page)) {
    return fallback;
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export function loginPath(next?: string) {
  const target = next ? safeNextPath(next, '') : '';
  return target ? `${routes.login}?next=${encodeURIComponent(target)}` : routes.login;
}
