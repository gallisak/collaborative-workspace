import 'server-only';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import createClient from 'openapi-fetch';
import { cache } from 'react';
import { ApiError, type ApiResult } from '../api/errors';
import type { paths } from '../api/schema';
import { serverEnv } from '../config/server-env';
import { routes } from '../config/routes';

const BODYLESS = new Set(['GET', 'HEAD']);

async function uncachedFetch(request: Request) {
  return fetch(request.url, {
    method: request.method,
    headers: request.headers,
    body: BODYLESS.has(request.method) ? undefined : await request.text(),
    cache: 'no-store',
  });
}

export type ServerApi = Awaited<ReturnType<typeof serverApi>>;

export async function serverApi() {
  const cookieHeader = (await cookies()).toString();
  return createClient<paths>({
    baseUrl: serverEnv.API_INTERNAL_URL,
    headers: {
      ...(cookieHeader && { cookie: cookieHeader }),
      origin: new URL(serverEnv.FRONTEND_URL).origin,
    },
    fetch: uncachedFetch,
  });
}

export async function load<T>(call: (api: ServerApi) => Promise<ApiResult<T>>): Promise<T> {
  const { data, error, response } = await call(await serverApi());
  if (response.status === 401) {
    redirect(routes.sessionExpired);
  }
  if (response.status === 404) {
    notFound();
  }
  if (!response.ok) {
    throw ApiError.from(response.status, error);
  }
  return data as T;
}

export async function loadOptional<T>(
  call: (api: ServerApi) => Promise<ApiResult<T>>,
): Promise<T | null> {
  const { data, error, response } = await call(await serverApi());
  if (response.status === 401) {
    redirect(routes.sessionExpired);
  }
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw ApiError.from(response.status, error);
  }
  return data as T;
}

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string; status: number };

export async function mutate<T>(
  call: (api: ServerApi) => Promise<ApiResult<T>>,
): Promise<ActionResult<T>> {
  const { data, error, response } = await call(await serverApi());
  if (response.status === 401) {
    redirect(routes.sessionExpired);
  }
  if (!response.ok) {
    return {
      ok: false,
      error: ApiError.from(response.status, error).message,
      status: response.status,
    };
  }
  return { ok: true, data: data as T };
}

export const getSessionUser = cache(() => load((api) => api.GET('/api/auth/me')));
