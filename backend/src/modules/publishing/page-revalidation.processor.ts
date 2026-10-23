import { Processor } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { PUBLISHING_QUEUE, type RevalidatePageJob } from '../../infra/queue/publishing-jobs.js';
import { TracedWorkerHost } from '../../infra/queue/traced-job.js';
import { RevalidationClient } from './revalidation.client.js';

@Processor(PUBLISHING_QUEUE)
export class PageRevalidationProcessor extends TracedWorkerHost {
  private readonly logger = new Logger(PageRevalidationProcessor.name);

  constructor(private readonly client: RevalidationClient) {
    super();
  }

  protected async handle({ data: { documentId }, attemptsMade }: Job<RevalidatePageJob>) {
    await this.client.revalidate(documentId);
    this.logger.log({ documentId, attempt: attemptsMade + 1 }, 'Public page revalidated');
  }
}
