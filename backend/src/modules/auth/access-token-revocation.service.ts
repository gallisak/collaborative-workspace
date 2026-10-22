import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import type { AccessTokenPayload } from '../../common/auth/auth.types.js';
import { durationToSeconds } from '../../common/duration.js';
import type { Env } from '../../infra/config/env.schema.js';
import { REDIS } from '../../infra/redis/redis.module.js';

const key = (userId: string) => `auth:revoked-before:${userId}`;

export function issuedAtMs(payload: AccessTokenPayload): number | undefined {
  return payload.iatMs ?? (payload.iat === undefined ? undefined : payload.iat * 1000);
}

export function issuedBeforeRevocation(issuedAt: number | undefined, revokedBefore: string | null) {
  return issuedAt !== undefined && revokedBefore !== null && issuedAt < Number(revokedBefore);
}

@Injectable()
export class AccessTokenRevocationService {
  private readonly logger = new Logger(AccessTokenRevocationService.name);
  private readonly ttlSeconds: number;

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    config: ConfigService<Env, true>,
  ) {
    this.ttlSeconds = durationToSeconds(config.get('JWT_ACCESS_TTL', { infer: true })) + 60;
  }

  async revokeIssuedBeforeNow(userId: string) {
    try {
      await this.redis.set(key(userId), Date.now(), 'EX', this.ttlSeconds);
    } catch (error) {
      this.logger.warn({ err: error, userId }, 'Could not revoke access tokens');
    }
  }

  async isRevoked(payload: AccessTokenPayload): Promise<boolean> {
    const userId = payload.sub;
    try {
      return issuedBeforeRevocation(issuedAtMs(payload), await this.redis.get(key(userId)));
    } catch (error) {
      this.logger.warn({ err: error, userId }, 'Revocation check unavailable, allowing token');
      return false;
    }
  }
}
