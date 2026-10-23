import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS } from '../../infra/redis/redis.module.js';

const TTL_SECONDS = 60;
const versionKey = (workspaceId: string) => `documents:tree-version:${workspaceId}`;
const treeKey = (workspaceId: string, version: string) =>
  `documents:tree:${workspaceId}:${version}`;

@Injectable()
export class TreeCacheService {
  private readonly logger = new Logger(TreeCacheService.name);

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async get<T>(workspaceId: string, load: () => Promise<T>): Promise<T> {
    let version: string;
    try {
      version = (await this.redis.get(versionKey(workspaceId))) ?? '0';
      const cached = await this.redis.get(treeKey(workspaceId, version));
      if (cached !== null) {
        return JSON.parse(cached) as T;
      }
    } catch (error) {
      this.logger.warn(
        { err: error, workspaceId },
        'Tree cache unavailable, reading from database',
      );
      return load();
    }

    const value = await load();
    try {
      await this.redis.set(treeKey(workspaceId, version), JSON.stringify(value), 'EX', TTL_SECONDS);
    } catch (error) {
      this.logger.warn({ err: error, workspaceId }, 'Could not store tree in cache');
    }
    return value;
  }

  async invalidate(workspaceId: string) {
    try {
      await this.redis.incr(versionKey(workspaceId));
    } catch (error) {
      this.logger.warn({ err: error, workspaceId }, 'Could not invalidate tree cache');
    }
  }
}
