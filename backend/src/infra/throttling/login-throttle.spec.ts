import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { clientIp, isLoginRequest, loginEmailTracker } from './login-throttle.js';

const req = (body?: unknown, ip = '10.0.0.1', ips: string[] = []) =>
  ({ body, ip, ips }) as Pick<Request, 'ip' | 'ips' | 'body'>;

const httpContext = (method: string, path: string) =>
  ({
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => ({ method, path }) }),
  }) as unknown as ExecutionContext;

describe('login throttling', () => {
  it('tracks login attempts per ip and normalized email', () => {
    expect(loginEmailTracker(req({ email: ' User@Mail.com ' }))).toBe('10.0.0.1:user@mail.com');
  });

  it('still tracks per ip when the email is missing', () => {
    expect(loginEmailTracker(req({}))).toBe('10.0.0.1:');
  });

  it('prefers the client ip from a trusted proxy chain', () => {
    expect(clientIp(req(undefined, '172.18.0.2', ['203.0.113.7']))).toBe('203.0.113.7');
  });

  it('recognizes only POST /auth/login', () => {
    expect(isLoginRequest(httpContext('POST', '/api/auth/login'))).toBe(true);
    expect(isLoginRequest(httpContext('GET', '/api/auth/login'))).toBe(false);
    expect(isLoginRequest(httpContext('POST', '/api/auth/register'))).toBe(false);
  });

  it('ignores non-http contexts', () => {
    expect(isLoginRequest({ getType: () => 'ws' } as unknown as ExecutionContext)).toBe(false);
  });
});
