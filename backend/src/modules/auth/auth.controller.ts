import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { CookieOptions, Request, Response } from 'express';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '../../common/auth/auth-cookies.js';
import type { AuthUser, IssuedTokens } from '../../common/auth/auth.types.js';
import { CurrentUser, Public } from '../../common/auth/decorators.js';
import type { Env } from '../../infra/config/env.schema.js';
import { clientIp } from '../../infra/throttling/login-throttle.js';
import { PublicUser } from '../users/user.dto.js';
import { UsersService } from '../users/users.service.js';
import { AuthResponseDto, LoginDto, RegisterDto } from './auth.dto.js';
import { AuthResult, AuthService } from './auth.service.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly secureCookies: boolean;

  constructor(
    private readonly auth: AuthService,
    config: ConfigService<Env, true>,
  ) {
    this.secureCookies = config.get('NODE_ENV', { infer: true }) === 'production';
  }

  @Public()
  @Post('register')
  @ApiCreatedResponse({ type: AuthResponseDto })
  @ApiConflictResponse({ description: 'Email is already registered' })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    return this.respond(await this.auth.register(dto), res);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid email or password' })
  @ApiTooManyRequestsResponse({ description: 'Too many attempts for one email or from one IP' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    return this.respond(await this.auth.login(dto), res);
  }

  @Public()
  @ApiCookieAuth(REFRESH_COOKIE)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({ description: 'Refresh token is missing, expired, revoked or reused' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    try {
      const client = { ip: clientIp(req), userAgent: req.get('user-agent') ?? '' };
      return this.respond(await this.auth.refresh(this.refreshTokenFrom(req), client), res);
    } catch (error) {
      this.clearSession(res);
      throw error;
    }
  }

  @Public()
  @ApiCookieAuth(REFRESH_COOKIE)
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(this.refreshTokenFrom(req));
    this.clearSession(res);
  }

  @ApiBearerAuth()
  @ApiCookieAuth(ACCESS_COOKIE)
  @Get('me')
  @ApiOkResponse({ type: PublicUser })
  async me(@CurrentUser() current: AuthUser): Promise<PublicUser> {
    return UsersService.toPublic(await this.auth.currentUser(current.id));
  }

  private respond({ user, tokens }: AuthResult, res: Response): AuthResponseDto {
    this.setSession(tokens, res);
    return { user: UsersService.toPublic(user) };
  }

  private refreshTokenFrom(req: Request): string | undefined {
    return (req.cookies as Record<string, string | undefined>)[REFRESH_COOKIE];
  }

  private setSession(tokens: IssuedTokens, res: Response) {
    res.cookie(ACCESS_COOKIE, tokens.accessToken, {
      ...this.cookieOptions(),
      expires: tokens.accessTokenExpiresAt,
    });
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      ...this.cookieOptions(),
      expires: tokens.refreshTokenExpiresAt,
    });
  }

  private clearSession(res: Response) {
    res.clearCookie(ACCESS_COOKIE, this.cookieOptions());
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
  }

  private cookieOptions(): CookieOptions {
    return { httpOnly: true, sameSite: 'lax', secure: this.secureCookies, path: '/' };
  }
}
