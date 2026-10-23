import { Injectable } from '@nestjs/common';
import { PrismaRepository } from '../../infra/prisma/unit-of-work.js';

export interface StoredDocument {
  state: Uint8Array | null;
  snapshotUpdateId: bigint;
  updates: { id: bigint; data: Uint8Array }[];
}

@Injectable()
export class DocumentStore extends PrismaRepository {
  async load(documentId: string): Promise<StoredDocument> {
    const snapshot = await this.prisma.documentState.findUnique({ where: { documentId } });
    const snapshotUpdateId = snapshot?.lastUpdateId ?? 0n;
    const updates = await this.prisma.documentUpdate.findMany({
      where: { documentId, id: { gt: snapshotUpdateId } },
      orderBy: { id: 'asc' },
      select: { id: true, data: true },
    });
    return { state: snapshot?.state ?? null, snapshotUpdateId, updates };
  }

  async append(documentId: string, data: Uint8Array): Promise<bigint> {
    const { id } = await this.prisma.documentUpdate.create({
      data: { documentId, data: new Uint8Array(data) },
      select: { id: true },
    });
    return id;
  }

  async compact(documentId: string, state: Uint8Array, upToUpdateId: bigint) {
    await this.prisma.$transaction([
      this.prisma.documentState.upsert({
        where: { documentId },
        create: { documentId, state: new Uint8Array(state), lastUpdateId: upToUpdateId },
        update: { state: new Uint8Array(state), lastUpdateId: upToUpdateId },
      }),
      this.prisma.documentUpdate.deleteMany({
        where: { documentId, id: { lte: upToUpdateId } },
      }),
    ]);
  }
}
