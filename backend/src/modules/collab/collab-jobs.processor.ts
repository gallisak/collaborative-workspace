import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import {
  COLLAB_QUEUE,
  CollabJob,
  type CreateVersionJob,
  type RestoreVersionJob,
} from '../../infra/queue/collab-jobs.js';
import { restoreContent } from './document-content.js';
import { RoomsService } from './rooms.service.js';
import { SnapshotsService } from './snapshots.service.js';
import { VersionStore } from './version-store.js';

export const RESTORE_ORIGIN = Symbol('restore');

@Processor(COLLAB_QUEUE)
export class CollabJobsProcessor extends WorkerHost {
  private readonly logger = new Logger(CollabJobsProcessor.name);

  constructor(
    private readonly rooms: RoomsService,
    private readonly snapshots: SnapshotsService,
    private readonly versions: VersionStore,
  ) {
    super();
  }

  async process(job: Job<CreateVersionJob | RestoreVersionJob>) {
    const { documentId } = job.data;
    if (!(await this.versions.isActive(documentId))) {
      this.logger.warn({ documentId, job: job.name }, 'Skipping job for a deleted document');
      return;
    }
    switch (job.name) {
      case CollabJob.CreateVersion:
        return this.createVersion(job.data as CreateVersionJob);
      case CollabJob.RestoreVersion:
        return this.restoreVersion(job.data as RestoreVersionJob);
      default:
        throw new Error(`Unknown collab job ${job.name}`);
    }
  }

  private async createVersion({ documentId, workspaceId, userId, name }: CreateVersionJob) {
    await this.rooms.use(documentId, workspaceId, (room) =>
      this.snapshots.take(room, 'MANUAL', name, userId),
    );
  }

  private async restoreVersion({ documentId, workspaceId, userId, versionId }: RestoreVersionJob) {
    const version = await this.versions.find(versionId, documentId);
    if (!version) {
      this.logger.warn({ documentId, versionId }, 'Version to restore no longer exists');
      return;
    }
    await this.rooms.use(documentId, workspaceId, async (room) => {
      await this.snapshots.take(room, 'AUTO', 'Before restore', userId);
      restoreContent(room.doc, version.state, RESTORE_ORIGIN);
      room.changedSinceVersion = false;
    });
    this.logger.log({ documentId, versionId, userId }, 'Document version restored');
  }
}
