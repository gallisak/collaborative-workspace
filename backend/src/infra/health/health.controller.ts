import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Redis } from 'ioredis';
import { Public } from '../../common/auth/decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { REDIS } from '../redis/redis.module.js';

type CheckStatus = 'up' | 'down';

const CHECK_TIMEOUT_MS = 2000;

const probe = (check: () => Promise<unknown>): Promise<CheckStatus> =>
  Promise.race([
    check(),
    new Promise((_, reject) => setTimeout(reject, CHECK_TIMEOUT_MS).unref()),
  ]).then(
    () => 'up',
    () => 'down',
  );

@SkipThrottle()
@Public()
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Get()
  @ApiOkResponse({ description: 'The process is running' })
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiOkResponse({ description: 'Database and Redis are reachable' })
  @ApiServiceUnavailableResponse({ description: 'A dependency is unavailable' })
  async ready() {
    const [database, redis] = await Promise.all([
      probe(() => this.prisma.$queryRaw`SELECT 1`),
      probe(() => this.redis.ping()),
    ]);
    const checks = { database, redis };
    if (database === 'down' || redis === 'down') {
      throw new ServiceUnavailableException({ status: 'unavailable', checks });
    }
    return { status: 'ok', checks };
  }
}
