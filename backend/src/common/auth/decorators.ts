import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from './auth.types.js';

export const IS_PUBLIC_KEY = 'auth:isPublic';

export const IS_OPTIONAL_AUTH_KEY = 'auth:isOptional';

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const OptionalAuth = () => SetMetadata(IS_OPTIONAL_AUTH_KEY, true);

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser =>
    ctx.switchToHttp().getRequest<Request & { user: AuthUser }>().user,
);

export const OptionalUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser | undefined =>
    ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>().user,
);
