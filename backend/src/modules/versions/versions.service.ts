import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Queue } from 'bullmq';
import {
  COLLAB_QUEUE,
  CollabJob,
  type CreateVersionJob,
  type RestoreVersionJob,
} from '../../infra/queue/collab-jobs.js';
import { traced } from '../../infra/queue/traced-job.js';
import { DocumentAccessService } from '../permissions/document-access.service.js';
import type { VersionDetailsDto, VersionDto } from './versions.dto.js';
import { VersionsRepository } from './versions.repository.js';

@Injectable()
export class VersionsService {
  private readonly logger = new Logger(VersionsService.name);

  constructor(
    private readonly versions: VersionsRepository,
    private readonly documentAccess: DocumentAccessService,
    @InjectQueue(COLLAB_QUEUE) private readonly queue: Queue,
  ) {}

  async list(userId: string, documentId: string): Promise<VersionDto[]> {
    await this.documentAccess.require(documentId, userId, 'VIEW');
    return this.versions.list(documentId);
  }

  async get(userId: string, documentId: string, versionId: string): Promise<VersionDetailsDto> {
    await this.documentAccess.require(documentId, userId, 'VIEW');
    const version = await this.versions.find(documentId, versionId);
    if (!version) {
      throw new NotFoundException('Version not found');
    }
    return { ...version, state: Buffer.from(version.state).toString('base64') };
  }

  async create(userId: string, documentId: string, name: string | undefined) {
    const { document } = await this.documentAccess.require(documentId, userId, 'EDIT');
    const job: CreateVersionJob = {
      documentId,
      workspaceId: document.workspaceId,
      userId,
      name: name ?? null,
    };
    await this.queue.add(CollabJob.CreateVersion, traced(job));
    this.logger.log({ documentId, userId }, 'Version requested');
  }

  async restore(userId: string, documentId: string, versionId: string) {
    const { document } = await this.documentAccess.require(documentId, userId, 'EDIT');
    if (!(await this.versions.exists(documentId, versionId))) {
      throw new NotFoundException('Version not found');
    }
    const job: RestoreVersionJob = {
      documentId,
      workspaceId: document.workspaceId,
      userId,
      versionId,
    };
    await this.queue.add(CollabJob.RestoreVersion, traced(job));
    this.logger.log({ documentId, versionId, userId }, 'Version restore requested');
  }
}
