import { InjectQueue, Processor } from '@nestjs/bullmq';
import { Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Job, Queue } from 'bullmq';
import { durationToSeconds } from '../../common/duration.js';
import type { Env } from '../../infra/config/env.schema.js';
import {
  ATTACHMENTS_QUEUE,
  AttachmentJob,
  type PurgeWorkspaceJob,
} from '../../infra/queue/attachment-jobs.js';
import { TracedWorkerHost } from '../../infra/queue/traced-job.js';
import { StorageService } from '../../infra/storage/storage.service.js';
import { objectKey } from './attachment-rules.js';
import { AttachmentsRepository } from './attachments.repository.js';

const BATCH = 500;

@Processor(ATTACHMENTS_QUEUE)
export class UploadCleanupProcessor extends TracedWorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger(UploadCleanupProcessor.name);
  private readonly uploadWindowMs: number;
  private readonly everyMs: number;

  constructor(
    private readonly attachments: AttachmentsRepository,
    private readonly storage: StorageService,
    @InjectQueue(ATTACHMENTS_QUEUE) private readonly queue: Queue,
    config: ConfigService<Env, true>,
  ) {
    super();
    this.uploadWindowMs =
      durationToSeconds(config.get('ATTACHMENT_UPLOAD_TTL', { infer: true })) * 1000;
    this.everyMs = config.get('ATTACHMENT_CLEANUP_INTERVAL_MS', { infer: true });
  }

  async onApplicationBootstrap() {
    await this.queue.upsertJobScheduler(
      AttachmentJob.CleanupUploads,
      { every: this.everyMs },
      { name: AttachmentJob.CleanupUploads },
    );
  }

  protected async handle(job: Job) {
    switch (job.name) {
      case AttachmentJob.CleanupUploads:
        return this.cleanupUploads();
      case AttachmentJob.PurgeWorkspace:
        return this.purgeWorkspace(job.data as PurgeWorkspaceJob);
      default:
        throw new Error(`Unknown attachments job ${job.name}`);
    }
  }

  private async purgeWorkspace({ workspaceId }: PurgeWorkspaceJob) {
    const removed = await this.storage.deletePrefix(objectKey(workspaceId, ''));
    this.logger.log({ workspaceId, removed }, 'Objects of a deleted workspace removed');
  }

  private async cleanupUploads() {
    const abandoned = await this.attachments.findAbandoned(
      new Date(Date.now() - this.uploadWindowMs),
      BATCH,
    );
    if (abandoned.length === 0) {
      return;
    }
    await this.storage.delete(abandoned.map((attachment) => attachment.objectKey));
    await this.attachments.deleteMany(abandoned.map((attachment) => attachment.id));
    this.logger.log({ removed: abandoned.length }, 'Abandoned uploads removed');
  }
}
