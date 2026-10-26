import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaRepository, type Transaction } from '../../infra/prisma/unit-of-work.js';
import { activeShareLinkWhere } from '../permissions/document-access.js';

export const ofLiveDocuments: Prisma.AttachmentWhereInput = {
  OR: [{ documentId: null }, { document: { deletedAt: null } }],
};

export interface NewAttachment {
  workspaceId: string;
  documentId: string;
  uploadedById: string;
  objectKey: string;
  fileName: string;
  contentType: string;
  sizeBytes: bigint;
}

@Injectable()
export class AttachmentsRepository extends PrismaRepository {
  async reservedBytes(workspaceId: string, pendingSince: Date, tx: Transaction) {
    const { _sum } = await tx.attachment.aggregate({
      where: {
        workspaceId,
        AND: [
          ofLiveDocuments,
          { OR: [{ status: 'UPLOADED' }, { status: 'PENDING', createdAt: { gt: pendingSince } }] },
        ],
      },
      _sum: { sizeBytes: true },
    });
    return _sum.sizeBytes ?? 0n;
  }

  async uploadedBytes(workspaceId: string) {
    const { _sum } = await this.prisma.attachment.aggregate({
      where: { workspaceId, status: 'UPLOADED', ...ofLiveDocuments },
      _sum: { sizeBytes: true },
    });
    return _sum.sizeBytes ?? 0n;
  }

  create(data: NewAttachment, tx: Transaction) {
    return tx.attachment.create({ data });
  }

  find(attachmentId: string) {
    return this.prisma.attachment.findUnique({ where: { id: attachmentId } });
  }

  markUploaded(attachmentId: string) {
    return this.prisma.attachment.update({
      where: { id: attachmentId },
      data: { status: 'UPLOADED' },
    });
  }

  delete(attachmentId: string) {
    return this.prisma.attachment.delete({ where: { id: attachmentId } });
  }

  async isPublished(documentId: string, now: Date) {
    const count = await this.prisma.shareLink.count({
      where: {
        documentId,
        ...activeShareLinkWhere(now),
        document: { deletedAt: null },
      },
    });
    return count > 0;
  }

  findAbandoned(createdBefore: Date, limit: number) {
    return this.prisma.attachment.findMany({
      where: { status: 'PENDING', createdAt: { lt: createdBefore } },
      select: { id: true, objectKey: true },
      take: limit,
    });
  }

  findOfDeletedDocuments(documentIds: string[]) {
    return this.prisma.attachment.findMany({
      where: { documentId: { in: documentIds }, document: { deletedAt: { not: null } } },
      select: { id: true, objectKey: true },
    });
  }

  deleteByIds(ids: string[]) {
    return this.prisma.attachment.deleteMany({ where: { id: { in: ids } } });
  }

  deleteMany(ids: string[]) {
    return this.prisma.attachment.deleteMany({ where: { id: { in: ids }, status: 'PENDING' } });
  }
}
