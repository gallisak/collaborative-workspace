import { Injectable } from '@nestjs/common';
import { PrismaRepository } from '../../infra/prisma/unit-of-work.js';

const summary = {
  id: true,
  kind: true,
  name: true,
  createdAt: true,
  createdBy: { select: { id: true, name: true } },
} as const;

@Injectable()
export class VersionsRepository extends PrismaRepository {
  list(documentId: string) {
    return this.prisma.documentVersion.findMany({
      where: { documentId },
      orderBy: { createdAt: 'desc' },
      select: summary,
    });
  }

  find(documentId: string, versionId: string) {
    return this.prisma.documentVersion.findFirst({
      where: { id: versionId, documentId },
      select: { ...summary, state: true },
    });
  }

  async exists(documentId: string, versionId: string) {
    const count = await this.prisma.documentVersion.count({ where: { id: versionId, documentId } });
    return count === 1;
  }
}
