import createClient from 'openapi-fetch';
import type { paths } from './schema';

const AUTH_PATHS = ['/api/auth/login', '/api/auth/register', '/api/auth/refresh'];

let refreshing: Promise<boolean> | null = null;

export function refreshSession(): Promise<boolean> {
  refreshing ??= fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' })
    .then((response) => response.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export async function fetchWithRefresh(request: Request): Promise<Response> {
  const retry = request.clone();
  const response = await fetch(request);
  const isAuthCall = AUTH_PATHS.includes(new URL(request.url).pathname);
  if (response.status !== 401 || isAuthCall || !(await refreshSession())) {
    return response;
  }
  return fetch(retry);
}

export const api = createClient<paths>({
  baseUrl: '',
  credentials: 'same-origin',
  fetch: fetchWithRefresh,
});
