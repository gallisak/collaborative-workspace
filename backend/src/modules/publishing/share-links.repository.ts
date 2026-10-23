import { Injectable } from '@nestjs/common';
import type { AccessLevel } from '../../generated/prisma/enums.js';
import { PrismaRepository } from '../../infra/prisma/unit-of-work.js';

const linkSelect = {
  id: true,
  token: true,
  accessLevel: true,
  expiresAt: true,
  createdAt: true,
} as const;

export interface NewShareLink {
  documentId: string;
  token: string;
  accessLevel: AccessLevel;
  expiresAt: Date | null;
  createdById: string;
}

@Injectable()
export class ShareLinksRepository extends PrismaRepository {
  create(data: NewShareLink) {
    return this.prisma.shareLink.create({ data, select: linkSelect });
  }

  listActive(documentId: string, now: Date) {
    return this.prisma.shareLink.findMany({
      where: {
        documentId,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { createdAt: 'desc' },
      select: linkSelect,
    });
  }

  findUnrevoked(linkId: string) {
    return this.prisma.shareLink.findFirst({
      where: { id: linkId, revokedAt: null },
      select: { id: true, documentId: true },
    });
  }

  revoke(linkId: string) {
    return this.prisma.shareLink.update({
      where: { id: linkId },
      data: { revokedAt: new Date() },
    });
  }

  findByToken(token: string) {
    return this.prisma.shareLink.findUnique({
      where: { token },
      select: {
        accessLevel: true,
        expiresAt: true,
        revokedAt: true,
        document: { select: { id: true, title: true, deletedAt: true } },
      },
    });
  }
}
