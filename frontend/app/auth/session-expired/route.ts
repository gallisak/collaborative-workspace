import { type NextRequest, NextResponse } from 'next/server';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '@/app/proxy';
import { serverApi } from '@/shared/dal';
import { loginPath } from '@/shared/lib';

export async function GET(request: NextRequest) {
  const api = await serverApi();
  await api.POST('/api/auth/logout').catch(() => undefined);
  const next = request.nextUrl.searchParams.get('next') ?? undefined;
  const response = NextResponse.redirect(new URL(loginPath(next), request.url));
  response.cookies.delete(ACCESS_COOKIE);
  response.cookies.delete(REFRESH_COOKIE);
  return response;
}
