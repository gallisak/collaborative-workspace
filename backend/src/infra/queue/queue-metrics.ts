import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { MetricsService } from '../metrics/metrics.service.js';
import { ATTACHMENTS_QUEUE } from './attachment-jobs.js';
import { BILLING_QUEUE } from './billing-jobs.js';
import { COLLAB_QUEUE } from './collab-jobs.js';
import { NOTIFICATIONS_QUEUE } from './notification-jobs.js';
import { PUBLISHING_QUEUE } from './publishing-jobs.js';
import { SEARCH_QUEUE } from './search-jobs.js';

const STATES = ['waiting', 'delayed', 'active', 'failed'] as const;

@Injectable()
export class QueueMetrics implements OnModuleInit {
  private readonly queues: Queue[];

  constructor(
    private readonly metrics: MetricsService,
    @InjectQueue(COLLAB_QUEUE) collab: Queue,
    @InjectQueue(NOTIFICATIONS_QUEUE) notifications: Queue,
    @InjectQueue(PUBLISHING_QUEUE) publishing: Queue,
    @InjectQueue(SEARCH_QUEUE) search: Queue,
    @InjectQueue(BILLING_QUEUE) billing: Queue,
    @InjectQueue(ATTACHMENTS_QUEUE) attachments: Queue,
  ) {
    this.queues = [collab, notifications, publishing, search, billing, attachments];
  }

  onModuleInit() {
    const queues = this.queues;
    this.metrics.gauge({
      name: 'queue_jobs',
      help: 'Jobs in background queues by state',
      labelNames: ['queue', 'state'] as const,
      async collect() {
        const counts = await Promise.all(queues.map((queue) => queue.getJobCounts(...STATES)));
        queues.forEach((queue, i) => {
          for (const state of STATES) {
            this.set({ queue: queue.name, state }, counts[i][state] ?? 0);
          }
        });
      },
    });
  }
}
