import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { CollabEventsService } from '../../infra/collab-events/collab-events.service.js';
import { MetricsService } from '../../infra/metrics/metrics.service.js';
import { DocumentAccessService } from '../permissions/document-access.service.js';
import { PageRevalidationService } from './page-revalidation.service.js';
import type { CreateShareLinkDto, ShareLinkDto } from './publishing.dto.js';
import { ShareLinksRepository } from './share-links.repository.js';

const TOKEN_BYTES = 24;

@Injectable()
export class ShareLinksService {
  private readonly logger = new Logger(ShareLinksService.name);

  constructor(
    private readonly links: ShareLinksRepository,
    private readonly documentAccess: DocumentAccessService,
    private readonly pages: PageRevalidationService,
    private readonly collabEvents: CollabEventsService,
    private readonly metrics: MetricsService,
  ) {}

  async create(userId: string, documentId: string, dto: CreateShareLinkDto): Promise<ShareLinkDto> {
    const { document } = await this.documentAccess.require(documentId, userId, 'MANAGE');
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (expiresAt && expiresAt <= new Date()) {
      throw new BadRequestException('The link must expire in the future');
    }
    const link = await this.links.create({
      documentId,
      token: randomBytes(TOKEN_BYTES).toString('base64url'),
      accessLevel: dto.accessLevel,
      expiresAt,
      createdById: userId,
    });
    if (expiresAt) {
      await this.pages.scheduleAt(documentId, expiresAt);
    }
    this.metrics.documentsPublished.inc({ access_level: link.accessLevel });
    this.logger.log(
      {
        workspaceId: document.workspaceId,
        documentId,
        linkId: link.id,
        accessLevel: link.accessLevel,
        expiresAt,
        userId,
      },
      'Document published',
    );
    return link;
  }

  async list(userId: string, documentId: string): Promise<ShareLinkDto[]> {
    await this.documentAccess.require(documentId, userId, 'MANAGE');
    return this.links.listActive(documentId, new Date());
  }

  async revoke(userId: string, linkId: string) {
    const link = await this.links.findUnrevoked(linkId);
    if (!link) {
      throw new NotFoundException('Share link not found');
    }
    const { document } = await this.documentAccess.require(link.documentId, userId, 'MANAGE');
    await this.links.revoke(linkId);
    await this.collabEvents.accessChanged(document.workspaceId);
    await this.pages.schedule(link.documentId);
    this.logger.log(
      { workspaceId: document.workspaceId, documentId: link.documentId, linkId, userId },
      'Share link revoked',
    );
  }
}
