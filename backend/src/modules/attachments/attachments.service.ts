import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { durationToSeconds } from '../../common/duration.js';
import type { Attachment } from '../../generated/prisma/client.js';
import type { Env } from '../../infra/config/env.schema.js';
import { UnitOfWork } from '../../infra/prisma/unit-of-work.js';
import { StorageService } from '../../infra/storage/storage.service.js';
import { DocumentAccessService } from '../permissions/document-access.service.js';
import { WorkspacesRepository } from '../workspaces/workspaces.repository.js';
import {
  assertStorage,
  attachmentPath,
  cleanFileName,
  formatBytes,
  objectKey,
} from './attachment-rules.js';
import type {
  AttachmentDto,
  CreateAttachmentDto,
  CreatedAttachmentDto,
} from './attachments.dto.js';
import { AttachmentsRepository } from './attachments.repository.js';

const toDto = (attachment: Attachment): AttachmentDto => ({
  id: attachment.id,
  documentId: attachment.documentId,
  fileName: attachment.fileName,
  contentType: attachment.contentType,
  sizeBytes: Number(attachment.sizeBytes),
  status: attachment.status,
  url: attachmentPath(attachment.id),
});

@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);
  private readonly maxBytes: number;
  private readonly uploadTtlSeconds: number;
  private readonly uploadWindowMs: number;
  private readonly downloadTtlSeconds: number;

  constructor(
    private readonly attachments: AttachmentsRepository,
    private readonly workspaces: WorkspacesRepository,
    private readonly documentAccess: DocumentAccessService,
    private readonly storage: StorageService,
    private readonly uow: UnitOfWork,
    config: ConfigService<Env, true>,
  ) {
    this.maxBytes = config.get('ATTACHMENT_MAX_BYTES', { infer: true });
    this.uploadTtlSeconds = durationToSeconds(config.get('ATTACHMENT_UPLOAD_TTL', { infer: true }));
    this.uploadWindowMs = this.uploadTtlSeconds * 1000;
    this.downloadTtlSeconds = durationToSeconds(
      config.get('ATTACHMENT_DOWNLOAD_TTL', { infer: true }),
    );
  }

  async create(
    userId: string,
    documentId: string,
    dto: CreateAttachmentDto,
  ): Promise<CreatedAttachmentDto> {
    const { document } = await this.documentAccess.require(documentId, userId, 'EDIT');
    if (dto.sizeBytes > this.maxBytes) {
      throw new PayloadTooLargeException(`Images can be up to ${formatBytes(this.maxBytes)}`);
    }
    const { workspaceId } = document;
    const attachment = await this.uow.run(async (tx) => {
      const workspace = await this.workspaces.lockWithPlan(workspaceId, tx);
      if (!workspace) {
        throw new NotFoundException('Workspace not found');
      }
      const reserved = await this.attachments.reservedBytes(
        workspaceId,
        new Date(Date.now() - this.uploadWindowMs),
        tx,
      );
      assertStorage(workspace.plan, reserved, BigInt(dto.sizeBytes));
      return this.attachments.create(
        {
          workspaceId,
          documentId,
          uploadedById: userId,
          objectKey: objectKey(workspaceId, randomUUID()),
          fileName: cleanFileName(dto.fileName),
          contentType: dto.contentType,
          sizeBytes: BigInt(dto.sizeBytes),
        },
        tx,
      );
    });
    const upload = await this.storage.presignUpload(
      attachment.objectKey,
      attachment.contentType,
      dto.sizeBytes,
      this.uploadTtlSeconds,
    );
    return {
      attachment: toDto(attachment),
      upload: { ...upload, expiresAt: new Date(Date.now() + this.uploadWindowMs) },
    };
  }

  async complete(userId: string, attachmentId: string): Promise<AttachmentDto> {
    const attachment = await this.editable(userId, attachmentId);
    if (attachment.status === 'UPLOADED') {
      return toDto(attachment);
    }
    if (attachment.createdAt.getTime() + this.uploadWindowMs < Date.now()) {
      throw new BadRequestException('The upload window has expired, start the upload again');
    }
    const stored = await this.storage.head(attachment.objectKey);
    if (!stored) {
      throw new BadRequestException('The file has not been uploaded yet');
    }
    if (
      BigInt(stored.sizeBytes) !== attachment.sizeBytes ||
      stored.contentType !== attachment.contentType
    ) {
      await this.storage.delete([attachment.objectKey]);
      throw new BadRequestException('The uploaded file does not match the declared one');
    }
    const uploaded = await this.attachments.markUploaded(attachmentId);
    this.logger.log(
      {
        workspaceId: attachment.workspaceId,
        documentId: attachment.documentId,
        attachmentId,
        sizeBytes: stored.sizeBytes,
        userId,
      },
      'Attachment uploaded',
    );
    return toDto(uploaded);
  }

  async remove(userId: string, attachmentId: string) {
    const attachment = await this.editable(userId, attachmentId);
    await this.storage.delete([attachment.objectKey]);
    await this.attachments.delete(attachmentId);
    this.logger.log(
      { workspaceId: attachment.workspaceId, attachmentId, userId },
      'Attachment deleted',
    );
  }

  async downloadUrl(userId: string | undefined, attachmentId: string) {
    const attachment = await this.attachments.find(attachmentId);
    if (!attachment || attachment.status !== 'UPLOADED' || !attachment.documentId) {
      throw new NotFoundException('Attachment not found');
    }
    if (!(await this.canRead(userId, attachment.documentId))) {
      throw new NotFoundException('Attachment not found');
    }
    return {
      url: await this.storage.presignDownload(attachment.objectKey, this.downloadTtlSeconds),
      maxAgeSeconds: Math.floor(this.downloadTtlSeconds / 2),
    };
  }

  private async canRead(userId: string | undefined, documentId: string) {
    if (userId) {
      const readable = await this.documentAccess.resolve(documentId, userId).then(
        () => true,
        () => false,
      );
      if (readable) {
        return true;
      }
    }
    return this.attachments.isPublished(documentId, new Date());
  }

  private async editable(userId: string, attachmentId: string) {
    const attachment = await this.attachments.find(attachmentId);
    if (!attachment?.documentId) {
      throw new NotFoundException('Attachment not found');
    }
    await this.documentAccess.require(attachment.documentId, userId, 'EDIT');
    return attachment;
  }
}
