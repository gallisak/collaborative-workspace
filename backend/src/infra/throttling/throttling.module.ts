import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule, type ThrottlerModuleOptions } from '@nestjs/throttler';
import type { Env } from '../config/env.schema.js';
import { isLoginRequest, loginEmailTracker, type TrackedRequest } from './login-throttle.js';
import { RedisThrottlerStorage } from './redis-throttler.storage.js';

const MINUTE = 60_000;
const notLogin = (context: Parameters<typeof isLoginRequest>[0]) => !isLoginRequest(context);

@Module({
  providers: [RedisThrottlerStorage],
  exports: [RedisThrottlerStorage],
})
class ThrottlerStorageModule {}

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [ThrottlerStorageModule],
      inject: [ConfigService, RedisThrottlerStorage],
      useFactory: (
        config: ConfigService<Env, true>,
        storage: RedisThrottlerStorage,
      ): ThrottlerModuleOptions => ({
        throttlers: [
          {
            name: 'default',
            ttl: MINUTE,
            limit: config.get('RATE_LIMIT_PER_MINUTE', { infer: true }),
            skipIf: (context) => context.getType() !== 'http',
          },
          {
            name: 'login-email',
            ttl: MINUTE,
            limit: config.get('LOGIN_EMAIL_RATE_LIMIT_PER_MINUTE', { infer: true }),
            blockDuration: MINUTE,
            skipIf: notLogin,
            getTracker: (req) => loginEmailTracker(req as TrackedRequest),
          },
          {
            name: 'login-ip',
            ttl: MINUTE,
            limit: config.get('LOGIN_IP_RATE_LIMIT_PER_MINUTE', { infer: true }),
            blockDuration: MINUTE,
            skipIf: notLogin,
          },
        ],
        storage,
      }),
    }),
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class ThrottlingModule {}
