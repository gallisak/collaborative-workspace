import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import type { AccessTokenPayload, AuthUser, IssuedTokens } from '../../common/auth/auth.types.js';
import { durationToSeconds } from '../../common/duration.js';
import type { User } from '../../generated/prisma/client.js';
import type { Env } from '../../infra/config/env.schema.js';
import { type Transaction, UnitOfWork } from '../../infra/prisma/unit-of-work.js';
import { AccessTokenRevocationService } from './access-token-revocation.service.js';
import { RefreshTokensRepository } from './refresh-tokens.repository.js';
import { isWithinRotationGrace } from './token-rules.js';

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);
  private readonly accessTtlSeconds: number;
  private readonly refreshTtlSeconds: number;
  private readonly rotationGraceSeconds: number;

  constructor(
    private readonly refreshTokens: RefreshTokensRepository,
    private readonly uow: UnitOfWork,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
    private readonly revocation: AccessTokenRevocationService,
  ) {
    this.accessTtlSeconds = durationToSeconds(config.get('JWT_ACCESS_TTL', { infer: true }));
    this.refreshTtlSeconds = durationToSeconds(config.get('REFRESH_TOKEN_TTL', { infer: true }));
    this.rotationGraceSeconds = config.get('REFRESH_ROTATION_GRACE_SECONDS', { infer: true });
  }

  async issue(user: AuthUser, familyId: string = randomUUID(), tx?: Transaction) {
    const issuedAt = Date.now();
    const payload: AccessTokenPayload = { sub: user.id, iatMs: issuedAt };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
      expiresIn: this.accessTtlSeconds,
    });

    const refreshToken = randomBytes(48).toString('base64url');
    const refreshTokenExpiresAt = new Date(issuedAt + this.refreshTtlSeconds * 1000);
    await this.refreshTokens.create(
      {
        userId: user.id,
        tokenHash: this.hash(refreshToken),
        familyId,
        expiresAt: refreshTokenExpiresAt,
      },
      tx,
    );

    return {
      accessToken,
      accessTokenExpiresAt: new Date(issuedAt + this.accessTtlSeconds * 1000),
      refreshToken,
      refreshTokenExpiresAt,
    } satisfies IssuedTokens;
  }

  async verifyAccessToken(token: string): Promise<AuthUser> {
    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
    if (await this.revocation.isRevoked(payload)) {
      throw new UnauthorizedException('Access token is outdated, refresh it');
    }
    return { id: payload.sub };
  }

  async rotate(refreshToken: string): Promise<{ user: User; tokens: IssuedTokens }> {
    const stored = await this.refreshTokens.findByHashWithUser(this.hash(refreshToken));
    if (!stored || stored.expiresAt <= new Date()) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const tokens = await this.uow.run(async (tx) => {
      const now = new Date();
      if (await this.refreshTokens.markRotated(stored.id, now, tx)) {
        return this.issue(stored.user, stored.familyId, tx);
      }

      const rotatedAt = await this.refreshTokens.rotatedAt(stored.id, tx);
      const familyActive = await this.refreshTokens.countActiveInFamily(stored.familyId, tx);
      return familyActive > 0 && isWithinRotationGrace(rotatedAt, now, this.rotationGraceSeconds)
        ? this.issue(stored.user, stored.familyId, tx)
        : null;
    });

    if (!tokens) {
      await this.refreshTokens.revokeFamily(stored.familyId);
      await this.revocation.revokeIssuedBeforeNow(stored.userId);
      this.logger.warn(
        { userId: stored.userId, familyId: stored.familyId },
        'Refresh token reuse detected, session family revoked',
      );
      throw new UnauthorizedException('Invalid refresh token');
    }

    return { user: stored.user, tokens };
  }

  async revoke(refreshToken: string) {
    const stored = await this.refreshTokens.findFamilyByHash(this.hash(refreshToken));
    if (stored) {
      await this.refreshTokens.revokeFamily(stored.familyId);
    }
  }

  private hash(token: string) {
    return createHmac('sha256', this.config.get('REFRESH_TOKEN_SECRET', { infer: true }))
      .update(token)
      .digest('hex');
  }
}
