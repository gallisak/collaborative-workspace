import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ClsService } from 'nestjs-cls';
import { ACCESS_COOKIE } from '../../../common/auth/auth-cookies.js';
import type { AuthUser } from '../../../common/auth/auth.types.js';
import { IS_PUBLIC_KEY } from '../../../common/auth/decorators.js';
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
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const token = extractAccessToken(req);
    if (!token) {
      throw new UnauthorizedException('Missing access token');
    }
    req.user = await this.tokens.verifyAccessToken(token);
    this.cls.set('userId', req.user.id);
    return true;
  }
}
