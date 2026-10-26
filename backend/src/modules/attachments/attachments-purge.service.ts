import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import { durationToSeconds } from '../../common/duration.js';
import type { Env } from '../../infra/config/env.schema.js';
import {
  ATTACHMENTS_QUEUE,
  AttachmentJob,
  type PurgeDocumentsJob,
  type PurgeWorkspaceJob,
} from '../../infra/queue/attachment-jobs.js';
import { traced } from '../../infra/queue/traced-job.js';

@Injectable()
export class AttachmentsPurgeService {
  private readonly logger = new Logger(AttachmentsPurgeService.name);
  private readonly uploadWindowMs: number;

  constructor(
    @InjectQueue(ATTACHMENTS_QUEUE) private readonly queue: Queue,
    config: ConfigService<Env, true>,
  ) {
    this.uploadWindowMs =
      durationToSeconds(config.get('ATTACHMENT_UPLOAD_TTL', { infer: true })) * 1000;
  }

  async purgeDocuments(documentIds: string[]) {
    if (documentIds.length === 0) {
      return;
    }
    const job: PurgeDocumentsJob = { documentIds };
    try {
      await this.queue.add(AttachmentJob.PurgeDocuments, traced(job));
    } catch (error) {
      this.logger.error({ err: error, documentIds }, 'Scheduling image cleanup failed');
    }
  }

  async purgeWorkspace(workspaceId: string) {
    const job: PurgeWorkspaceJob = { workspaceId };
    try {
      await Promise.all(
        [0, this.uploadWindowMs].map((delay) =>
          this.queue.add(AttachmentJob.PurgeWorkspace, traced(job), { delay }),
        ),
      );
    } catch (error) {
      this.logger.error({ err: error, workspaceId }, 'Scheduling storage purge failed');
    }
  }
}
