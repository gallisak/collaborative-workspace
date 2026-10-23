import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Document } from '../../generated/prisma/client.js';
import type { AccessLevel } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { PrismaRepository, type Transaction } from '../../infra/prisma/unit-of-work.js';
import {
  type DocumentAccess,
  hasAccess,
  isShareLinkActive,
  resolveDocumentAccess,
} from './document-access.js';
import { WorkspaceAccessService } from './workspace-access.service.js';

const MAX_TREE_DEPTH = 100;

export interface ResolvedDocument {
  document: Document;
  access: DocumentAccess;
}

export interface ResolvedLinkDocument extends ResolvedDocument {
  linkExpiresAt: Date | null;
}

@Injectable()
export class DocumentAccessService extends PrismaRepository {
  constructor(
    prisma: PrismaService,
    private readonly workspaces: WorkspaceAccessService,
  ) {
    super(prisma);
  }

  async resolve(documentId: string, userId: string, tx?: Transaction): Promise<ResolvedDocument> {
    const document = await this.findActive(documentId, tx);
    const access = await this.accessOf(document, userId, tx);
    if (access === 'NONE') {
      throw new NotFoundException('Document not found');
    }
    return { document, access };
  }

  async resolveWithLink(
    documentId: string,
    userId: string,
    shareToken: string,
  ): Promise<ResolvedLinkDocument> {
    const document = await this.findActive(documentId);
    const link = await this.prisma.shareLink.findFirst({
      where: { token: shareToken, documentId },
    });
    const active = link && isShareLinkActive(link, new Date()) ? link : null;
    const access = await this.accessOf(document, userId, undefined, active?.accessLevel ?? null);
    if (access === 'NONE') {
      throw new NotFoundException('Document not found');
    }
    return { document, access, linkExpiresAt: active?.expiresAt ?? null };
  }

  async accessOf(
    document: Pick<Document, 'id' | 'workspaceId'>,
    userId: string,
    tx?: Transaction,
    shareLinkLevel: AccessLevel | null = null,
  ): Promise<DocumentAccess> {
    const [workspaceRole, grantChain] = await Promise.all([
      this.workspaces.roleOf(document.workspaceId, userId, tx),
      this.grantChain(document.id, userId, tx),
    ]);
    return resolveDocumentAccess({
      workspaceRole,
      grantChain,
      shareLinkLevel,
      authenticated: true,
    });
  }

  async require(
    documentId: string,
    userId: string,
    minimum: Exclude<DocumentAccess, 'NONE'>,
    tx?: Transaction,
  ): Promise<ResolvedDocument> {
    const resolved = await this.resolve(documentId, userId, tx);
    if (!hasAccess(resolved.access, minimum)) {
      throw new ForbiddenException(`Requires ${minimum.toLowerCase()} access to this document`);
    }
    return resolved;
  }

  private async findActive(documentId: string, tx?: Transaction) {
    const document = await this.db(tx).document.findFirst({
      where: { id: documentId, deletedAt: null },
    });
    if (!document) {
      throw new NotFoundException('Document not found');
    }
    return document;
  }

  private async grantChain(documentId: string, userId: string, tx?: Transaction) {
    const rows = await this.db(tx).$queryRaw<{ access_level: AccessLevel | null }[]>`
      WITH RECURSIVE chain AS (
        SELECT id, parent_id, 0 AS depth FROM documents WHERE id = ${documentId}::uuid
        UNION ALL
        SELECT d.id, d.parent_id, chain.depth + 1
        FROM documents d JOIN chain ON d.id = chain.parent_id
        WHERE chain.depth < ${MAX_TREE_DEPTH}
      )
      SELECT p.access_level
      FROM chain
      LEFT JOIN document_permissions p ON p.document_id = chain.id AND p.user_id = ${userId}::uuid
      ORDER BY chain.depth`;
    return rows.map((row) => row.access_level);
  }
}
