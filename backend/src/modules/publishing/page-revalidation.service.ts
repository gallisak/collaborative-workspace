import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import type { Env } from '../../infra/config/env.schema.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import {
  PUBLISHING_QUEUE,
  PublishingJob,
  type RevalidatePageJob,
} from '../../infra/queue/publishing-jobs.js';
import { traced } from '../../infra/queue/traced-job.js';
import { activeShareLinkWhere } from '../permissions/document-access.js';

@Injectable()
export class PageRevalidationService {
  private readonly logger = new Logger(PageRevalidationService.name);
  private readonly delayMs: number;

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(PUBLISHING_QUEUE) private readonly queue: Queue,
    config: ConfigService<Env, true>,
  ) {
    this.delayMs = config.get('REVALIDATE_DELAY_MS', { infer: true });
  }

  async scheduleIfPublished(documentIds: readonly string[]) {
    try {
      const now = new Date();
      const published = await this.prisma.shareLink.findMany({
        where: {
          documentId: { in: [...documentIds] },
          ...activeShareLinkWhere(now),
        },
        distinct: ['documentId'],
        select: { documentId: true },
      });
      await this.scheduleAll(published.map(({ documentId }) => documentId));
    } catch (error) {
      this.logger.warn({ err: error, documentIds }, 'Scheduling page revalidation failed');
    }
  }

  async scheduleAll(documentIds: readonly string[]) {
    try {
      await Promise.all(documentIds.map((documentId) => this.schedule(documentId)));
    } catch (error) {
      this.logger.warn({ err: error, documentIds }, 'Scheduling page revalidation failed');
    }
  }

  async schedule(documentId: string) {
    const job: RevalidatePageJob = { documentId };
    await this.queue.add(PublishingJob.RevalidatePage, traced(job), {
      delay: this.delayMs,
      deduplication: { id: documentId, ttl: this.delayMs },
    });
  }

  async scheduleAt(documentId: string, at: Date) {
    const job: RevalidatePageJob = { documentId };
    await this.queue.add(PublishingJob.RevalidatePage, traced(job), {
      delay: Math.max(0, at.getTime() - Date.now()),
    });
  }
}
