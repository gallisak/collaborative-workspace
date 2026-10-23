import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema.js';
import { redisConnectionFromUrl } from '../redis/redis-url.js';
import { COLLAB_QUEUE } from './collab-jobs.js';

const queues = BullModule.registerQueue({
  name: COLLAB_QUEUE,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 500 },
    removeOnComplete: { age: 3600, count: 1000 },
    removeOnFail: { age: 7 * 24 * 3600 },
  },
});

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        prefix: 'collab-docs',
        connection: redisConnectionFromUrl(config.get('REDIS_URL', { infer: true })),
      }),
    }),
    queues,
  ],
  exports: [queues],
})
export class QueueModule {}
