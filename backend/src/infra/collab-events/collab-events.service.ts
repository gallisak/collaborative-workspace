import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS } from '../redis/redis.module.js';
import { ACCESS_CHANGED_CHANNEL } from './collab-events.js';

@Injectable()
export class CollabEventsService {
  private readonly logger = new Logger(CollabEventsService.name);

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async accessChanged(workspaceId: string) {
    try {
      await this.redis.publish(ACCESS_CHANGED_CHANNEL, workspaceId);
    } catch (error) {
      this.logger.warn(
        { err: error, workspaceId },
        'Could not notify collaboration sessions about an access change',
      );
    }
  }
}
