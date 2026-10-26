import type { NextRequest } from 'next/server';
import { sessionProxy } from '@/app/proxy';

const apiUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';
const appOrigin = new URL(process.env.FRONTEND_URL ?? 'http://localhost:3000').origin;

export function proxy(request: NextRequest) {
  return sessionProxy(request, { apiUrl, appOrigin });
}

export const config = {
  matcher: ['/((?!api|auth|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
