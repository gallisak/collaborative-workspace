// @vitest-environment node
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import nextConfig from './next.config';
import { config } from './proxy';

const matches = (url: string) => unstable_doesMiddlewareMatch({ config, nextConfig, url });

describe('proxy matcher', () => {
  it.each([
    '/',
    '/login',
    '/workspaces',
    '/w/1/d/2',
    '/s/token',
    '/billing/checkout/1',
    '/invitations/accept',
  ])('runs on %s', (url) => {
    expect(matches(url)).toBe(true);
  });

  it.each([
    '/api/auth/login',
    '/auth/session-expired',
    '/p/token',
    '/internal/revalidate',
    '/_next/static/chunk.js',
    '/favicon.ico',
  ])('skips %s', (url) => {
    expect(matches(url)).toBe(false);
  });
});
