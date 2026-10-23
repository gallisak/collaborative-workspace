import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ClsService } from 'nestjs-cls';
import { ACCESS_COOKIE } from '../../../common/auth/auth-cookies.js';
import type { AuthUser } from '../../../common/auth/auth.types.js';
import { IS_OPTIONAL_AUTH_KEY, IS_PUBLIC_KEY } from '../../../common/auth/decorators.js';
import { TokenService } from '../token.service.js';

export function extractBearerToken(header: string | undefined): string | undefined {
  const [scheme, token] = header?.split(' ') ?? [];
  return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
}

export function extractAccessToken(req: Pick<Request, 'headers' | 'cookies'>): string | undefined {
  return (
    extractBearerToken(req.headers.authorization) ??
    (req.cookies as Record<string, string | undefined> | undefined)?.[ACCESS_COOKIE]
  );
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly cls: ClsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') {
      return true;
    }
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }
    const optional = this.reflector.getAllAndOverride<boolean>(IS_OPTIONAL_AUTH_KEY, targets);

    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const token = extractAccessToken(req);
    if (!token) {
      if (optional) {
        return true;
      }
      throw new UnauthorizedException('Missing access token');
    }
    try {
      req.user = await this.tokens.verifyAccessToken(token);
    } catch (error) {
      if (optional) {
        return true;
      }
      throw error;
    }
    this.cls.set('userId', req.user.id);
    return true;
  }
}
