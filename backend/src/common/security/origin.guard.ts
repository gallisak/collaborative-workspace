import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { Env } from '../../infra/config/env.schema.js';
import { SESSION_COOKIES } from '../auth/auth-cookies.js';
import { isRequestFromAllowedOrigin } from './origin-policy.js';

@Injectable()
export class OriginGuard implements CanActivate {
  private readonly allowedOrigins: string[];

  constructor(config: ConfigService<Env, true>) {
    this.allowedOrigins = config.get('CORS_ORIGIN', { infer: true }).split(',');
  }

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') {
      return true;
    }
    const req = context.switchToHttp().getRequest<Request>();
    const cookies = (req.cookies ?? {}) as Record<string, string | undefined>;
    const allowed = isRequestFromAllowedOrigin(
      {
        method: req.method,
        origin: req.headers.origin,
        hasSessionCookie: SESSION_COOKIES.some((name) => cookies[name] !== undefined),
      },
      this.allowedOrigins,
    );
    if (!allowed) {
      throw new ForbiddenException('Cross-site request rejected');
    }
    return true;
  }
}
