import { Injectable, NotFoundException } from '@nestjs/common';
import * as Y from 'yjs';
import { CONTENT_FIELD } from '../collab/document-content.js';
import { applyStored, DocumentStore } from '../collab/document-store.js';
import { isShareLinkActive, SHARE_TOKEN_PATTERN } from '../permissions/document-access.js';
import { describeContent, toPublicBlocks } from './public-content.js';
import type { PublicDocumentDto } from './publishing.dto.js';
import { ShareLinksRepository } from './share-links.repository.js';

@Injectable()
export class PublicDocumentsService {
  constructor(
    private readonly links: ShareLinksRepository,
    private readonly store: DocumentStore,
  ) {}

  async get(token: string): Promise<PublicDocumentDto> {
    const link = SHARE_TOKEN_PATTERN.test(token) ? await this.links.findByToken(token) : null;
    if (!link || !isShareLinkActive(link, new Date()) || link.document.deletedAt) {
      throw new NotFoundException('Page not found');
    }
    const blocks = await this.blocksOf(link.document.id);
    return {
      id: link.document.id,
      title: link.document.title,
      description: describeContent(blocks),
      accessLevel: link.accessLevel,
      blocks,
    };
  }

  private async blocksOf(documentId: string) {
    const stored = await this.store.load(documentId);
    const doc = new Y.Doc();
    try {
      applyStored(doc, stored);
      return toPublicBlocks(doc.getXmlFragment(CONTENT_FIELD));
    } finally {
      doc.destroy();
    }
  }
}
