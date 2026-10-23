import type { ExecutionContext } from '@nestjs/common';
import { isShareLinkCreation, userTracker } from './share-link-throttle.js';

const httpContext = (method: string, path: string) =>
  ({
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => ({ method, path }) }),
  }) as unknown as ExecutionContext;

describe('share link throttling', () => {
  it('recognizes only link creation', () => {
    expect(isShareLinkCreation(httpContext('POST', '/api/documents/d1/share-links'))).toBe(true);
    expect(isShareLinkCreation(httpContext('GET', '/api/documents/d1/share-links'))).toBe(false);
    expect(isShareLinkCreation(httpContext('DELETE', '/api/share-links/l1'))).toBe(false);
    expect(isShareLinkCreation(httpContext('POST', '/api/documents/d1/threads'))).toBe(false);
  });

  it('tracks the signed in user, falling back to the ip', () => {
    expect(userTracker({ ip: '10.0.0.1', ips: [], user: { id: 'u1' } })).toBe('u1');
    expect(userTracker({ ip: '10.0.0.1', ips: [] })).toBe('10.0.0.1');
  });
});
