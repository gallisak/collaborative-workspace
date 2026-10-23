import { Injectable } from '@nestjs/common';
import type { AccessLevel } from '../../generated/prisma/enums.js';
import { PrismaRepository, type Transaction } from '../../infra/prisma/unit-of-work.js';

const MAX_TREE_DEPTH = 100;

interface SiblingScope {
  workspaceId: string;
  parentId: string | null;
  excludeId?: string;
}

const siblings = ({ workspaceId, parentId, excludeId }: SiblingScope) => ({
  workspaceId,
  parentId,
  deletedAt: null,
  ...(excludeId && { id: { not: excludeId } }),
});

@Injectable()
export class DocumentsRepository extends PrismaRepository {
  listTree(workspaceId: string) {
    return this.prisma.document.findMany({
      where: { workspaceId, deletedAt: null },
      select: { id: true, parentId: true, title: true, position: true },
      orderBy: [{ parentId: 'asc' }, { position: 'asc' }],
    });
  }

  countActive(workspaceId: string, tx: Transaction) {
    return tx.document.count({ where: { workspaceId, deletedAt: null } });
  }

  findActive(id: string, tx: Transaction) {
    return tx.document.findFirst({ where: { id, deletedAt: null } });
  }

  async lastPosition(scope: SiblingScope, tx: Transaction) {
    const last = await tx.document.findFirst({
      where: siblings(scope),
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    return last?.position ?? null;
  }

  async nextPosition(scope: SiblingScope, after: string | null, tx: Transaction) {
    const next = await tx.document.findFirst({
      where: { ...siblings(scope), ...(after !== null && { position: { gt: after } }) },
      orderBy: { position: 'asc' },
      select: { position: true },
    });
    return next?.position ?? null;
  }

  create(
    data: {
      workspaceId: string;
      parentId: string | null;
      title: string;
      position: string;
      createdById: string;
    },
    tx: Transaction,
  ) {
    return tx.document.create({ data });
  }

  rename(id: string, title: string) {
    return this.prisma.document.update({ where: { id }, data: { title } });
  }

  move(id: string, parentId: string | null, position: string, tx: Transaction) {
    return tx.document.update({ where: { id }, data: { parentId, position } });
  }

  async isSelfOrAncestor(documentId: string, candidateId: string, tx: Transaction) {
    const rows = await tx.$queryRaw<{ found: boolean }[]>`
      WITH RECURSIVE chain AS (
        SELECT id, parent_id, 0 AS depth FROM documents WHERE id = ${candidateId}::uuid
        UNION ALL
        SELECT d.id, d.parent_id, chain.depth + 1
        FROM documents d JOIN chain ON d.id = chain.parent_id
        WHERE chain.depth < ${MAX_TREE_DEPTH}
      )
      SELECT EXISTS (SELECT 1 FROM chain WHERE id = ${documentId}::uuid) AS found`;
    return rows[0]?.found ?? false;
  }

  softDeleteSubtree(rootId: string, at: Date, tx: Transaction) {
    return tx.$executeRaw`
      WITH RECURSIVE subtree AS (
        SELECT id, 0 AS depth FROM documents WHERE id = ${rootId}::uuid
        UNION ALL
        SELECT d.id, subtree.depth + 1
        FROM documents d JOIN subtree ON d.parent_id = subtree.id
        WHERE d.deleted_at IS NULL AND subtree.depth < ${MAX_TREE_DEPTH}
      )
      UPDATE documents SET deleted_at = ${at}, updated_at = ${at}
      WHERE id IN (SELECT id FROM subtree) AND deleted_at IS NULL`;
  }

  listPermissions(documentId: string) {
    return this.prisma.documentPermission.findMany({
      where: { documentId },
      include: { user: { select: { email: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  upsertPermission(
    documentId: string,
    userId: string,
    accessLevel: AccessLevel,
    grantedById: string,
  ) {
    return this.prisma.documentPermission.upsert({
      where: { documentId_userId: { documentId, userId } },
      create: { documentId, userId, accessLevel, grantedById },
      update: { accessLevel, grantedById },
    });
  }

  async deletePermission(documentId: string, userId: string) {
    const { count } = await this.prisma.documentPermission.deleteMany({
      where: { documentId, userId },
    });
    return count === 1;
  }
}
