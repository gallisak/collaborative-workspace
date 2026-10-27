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

  async ancestorIds(startId: string | null, tx: Transaction): Promise<string[]> {
    if (startId === null) {
      return [];
    }
    const rows = await tx.$queryRaw<{ id: string }[]>`
      WITH RECURSIVE chain AS (
        SELECT id, parent_id, 0 AS depth FROM documents WHERE id = ${startId}::uuid
        UNION ALL
        SELECT d.id, d.parent_id, chain.depth + 1
        FROM documents d JOIN chain ON d.id = chain.parent_id
        WHERE chain.depth < ${MAX_TREE_DEPTH}
      )
      SELECT id FROM chain`;
    return rows.map((row) => row.id);
  }

  async hasGrants(documentIds: string[], tx: Transaction) {
    if (documentIds.length === 0) {
      return false;
    }
    const count = await tx.documentPermission.count({
      where: { documentId: { in: documentIds } },
    });
    return count > 0;
  }

  async subtreeIds(rootId: string) {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      WITH RECURSIVE subtree AS (
        SELECT id, 0 AS depth FROM documents WHERE id = ${rootId}::uuid
        UNION ALL
        SELECT d.id, subtree.depth + 1
        FROM documents d JOIN subtree ON d.parent_id = subtree.id
        WHERE d.deleted_at IS NULL AND subtree.depth < ${MAX_TREE_DEPTH}
      )
      SELECT id FROM subtree`;
    return rows.map((row) => row.id);
  }

  async hasReadOnlyDescendant(rootId: string, userId: string, tx: Transaction) {
    const rows = await tx.$queryRaw<{ found: boolean }[]>`
      WITH RECURSIVE subtree AS (
        SELECT id, 'EDIT'::text AS level, 0 AS depth FROM documents WHERE id = ${rootId}::uuid
        UNION ALL
        SELECT d.id, COALESCE(p.access_level::text, subtree.level), subtree.depth + 1
        FROM documents d
        JOIN subtree ON d.parent_id = subtree.id
        LEFT JOIN document_permissions p ON p.document_id = d.id AND p.user_id = ${userId}::uuid
        WHERE d.deleted_at IS NULL AND subtree.depth < ${MAX_TREE_DEPTH}
      )
      SELECT EXISTS (SELECT 1 FROM subtree WHERE level = 'VIEW') AS found`;
    return rows[0]?.found ?? false;
  }

  async softDeleteSubtree(rootId: string, at: Date, tx: Transaction): Promise<string[]> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      WITH RECURSIVE subtree AS (
        SELECT id, 0 AS depth FROM documents WHERE id = ${rootId}::uuid
        UNION ALL
        SELECT d.id, subtree.depth + 1
        FROM documents d JOIN subtree ON d.parent_id = subtree.id
        WHERE d.deleted_at IS NULL AND subtree.depth < ${MAX_TREE_DEPTH}
      )
      UPDATE documents SET deleted_at = ${at}, updated_at = ${at}
      WHERE id IN (SELECT id FROM subtree) AND deleted_at IS NULL
      RETURNING id`;
    return rows.map((row) => row.id);
  }

  listSharedWith(userId: string) {
    return this.prisma.documentPermission.findMany({
      where: {
        userId,
        document: { deletedAt: null, workspace: { members: { none: { userId } } } },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        accessLevel: true,
        document: {
          select: {
            id: true,
            workspaceId: true,
            title: true,
            workspace: { select: { name: true } },
          },
        },
      },
    });
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
    tx: Transaction,
  ) {
    return tx.documentPermission.upsert({
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
