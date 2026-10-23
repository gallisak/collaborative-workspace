import { Injectable } from '@nestjs/common';
import type { VersionKind } from '../../generated/prisma/enums.js';
import { PrismaRepository } from '../../infra/prisma/unit-of-work.js';

@Injectable()
export class VersionStore extends PrismaRepository {
  async latestCreatedAt(documentId: string): Promise<Date | null> {
    const latest = await this.prisma.documentVersion.findFirst({
      where: { documentId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    return latest?.createdAt ?? null;
  }

  create(data: {
    documentId: string;
    kind: VersionKind;
    name: string | null;
    state: Uint8Array;
    createdById: string | null;
  }) {
    return this.prisma.documentVersion.create({
      data: { ...data, state: new Uint8Array(data.state) },
      select: { id: true, createdAt: true },
    });
  }

  async pruneAuto(documentId: string, keep: number) {
    const stale = await this.prisma.documentVersion.findMany({
      where: { documentId, kind: 'AUTO' },
      orderBy: { createdAt: 'desc' },
      skip: keep,
      select: { id: true },
    });
    if (stale.length > 0) {
      await this.prisma.documentVersion.deleteMany({
        where: { id: { in: stale.map((version) => version.id) } },
      });
    }
  }

  find(versionId: string, documentId: string) {
    return this.prisma.documentVersion.findFirst({ where: { id: versionId, documentId } });
  }

  async isActive(documentId: string) {
    const count = await this.prisma.document.count({ where: { id: documentId, deletedAt: null } });
    return count === 1;
  }
}
