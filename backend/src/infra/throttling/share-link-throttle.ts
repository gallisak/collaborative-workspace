import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from '../../common/auth/auth.types.js';
import { clientIp } from './login-throttle.js';

const SHARE_LINKS_PATH = /\/documents\/[^/]+\/share-links\/?$/;

export function isShareLinkCreation(context: ExecutionContext): boolean {
  if (context.getType() !== 'http') {
    return false;
  }
  const req = context.switchToHttp().getRequest<Request>();
  return req.method === 'POST' && SHARE_LINKS_PATH.test(req.path);
}

export function userTracker(req: Pick<Request, 'ip' | 'ips'> & { user?: AuthUser }): string {
  return req.user?.id ?? clientIp(req);
}
