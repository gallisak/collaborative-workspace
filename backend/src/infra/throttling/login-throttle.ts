import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export type TrackedRequest = Pick<Request, 'ip' | 'ips' | 'body'>;

export function clientIp(req: Pick<Request, 'ip' | 'ips'>): string {
  return req.ips.length ? req.ips[0] : (req.ip ?? 'unknown');
}

export function isLoginRequest(context: ExecutionContext): boolean {
  if (context.getType() !== 'http') {
    return false;
  }
  const req = context.switchToHttp().getRequest<Request>();
  return req.method === 'POST' && req.path.endsWith('/auth/login');
}

export function loginEmailTracker(req: TrackedRequest): string {
  const email: unknown = (req.body as { email?: unknown } | undefined)?.email;
  const normalized = typeof email === 'string' ? email.trim().toLowerCase() : '';
  return `${clientIp(req)}:${normalized}`;
}
