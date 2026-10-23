import { Injectable } from '@nestjs/common';
import { PrismaRepository } from '../../infra/prisma/unit-of-work.js';

const MAX_TREE_DEPTH = 100;
const TS_CONFIG = 'simple';
const HEADLINE_OPTIONS = 'StartSel="", StopSel="", MaxWords=30, MinWords=10, MaxFragments=1';

export interface SearchHit {
  id: string;
  parentId: string | null;
  title: string;
  snippet: string;
}

export interface SearchScope {
  workspaceId: string;
  userId: string;
  isMember: boolean;
}

@Injectable()
export class SearchRepository extends PrismaRepository {
  async search({ workspaceId, userId, isMember }: SearchScope, query: string, limit: number) {
    return this.prisma.$queryRaw<SearchHit[]>`
      WITH RECURSIVE shared AS (
        SELECT d.id, 0 AS depth
        FROM document_permissions p
        JOIN documents d ON d.id = p.document_id
        WHERE p.user_id = ${userId}::uuid
          AND d.workspace_id = ${workspaceId}::uuid
          AND d.deleted_at IS NULL
          AND NOT ${isMember}::boolean
        UNION ALL
        SELECT child.id, shared.depth + 1
        FROM documents child
        JOIN shared ON child.parent_id = shared.id
        WHERE child.deleted_at IS NULL AND shared.depth < ${MAX_TREE_DEPTH}
      ),
      q AS (SELECT to_tsquery(${TS_CONFIG}::regconfig, ${query}) AS query)
      SELECT d.id, d.parent_id AS "parentId", d.title,
             ts_headline(${TS_CONFIG}::regconfig, s.content, q.query, ${HEADLINE_OPTIONS}) AS snippet
      FROM document_search s
      JOIN documents d ON d.id = s.document_id
      CROSS JOIN q
      WHERE d.workspace_id = ${workspaceId}::uuid
        AND d.deleted_at IS NULL
        AND s.vector @@ q.query
        AND (${isMember}::boolean OR d.id IN (SELECT id FROM shared))
      ORDER BY ts_rank(s.vector, q.query) DESC, d.id
      LIMIT ${limit}`;
  }

  async hasSharedDocuments(workspaceId: string, userId: string) {
    const count = await this.prisma.documentPermission.count({
      where: { userId, document: { workspaceId, deletedAt: null } },
    });
    return count > 0;
  }

  findDocument(documentId: string) {
    return this.prisma.document.findUnique({
      where: { id: documentId },
      select: { title: true, deletedAt: true },
    });
  }

  upsert(documentId: string, title: string, content: string, indexedUpdateId: bigint) {
    return this.prisma.$executeRaw`
      INSERT INTO document_search (document_id, content, vector, indexed_update_id, updated_at)
      VALUES (
        ${documentId}::uuid,
        ${content},
        setweight(to_tsvector(${TS_CONFIG}::regconfig, ${title}), 'A')
          || setweight(to_tsvector(${TS_CONFIG}::regconfig, ${content}), 'B'),
        ${indexedUpdateId},
        now()
      )
      ON CONFLICT (document_id) DO UPDATE SET
        content = EXCLUDED.content,
        vector = EXCLUDED.vector,
        indexed_update_id = EXCLUDED.indexed_update_id,
        updated_at = EXCLUDED.updated_at
      WHERE document_search.indexed_update_id <= EXCLUDED.indexed_update_id`;
  }

  async staleDocumentIds(limit: number) {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT d.id
      FROM documents d
      LEFT JOIN document_search s ON s.document_id = d.id
      LEFT JOIN document_states st ON st.document_id = d.id
      WHERE d.deleted_at IS NULL
        AND (
          s.document_id IS NULL
          OR d.updated_at > s.updated_at
          OR COALESCE(st.last_update_id, 0) > s.indexed_update_id
          OR EXISTS (
            SELECT 1 FROM document_updates u
            WHERE u.document_id = d.id AND u.id > s.indexed_update_id
          )
        )
      LIMIT ${limit}`;
    return rows.map((row) => row.id);
  }
}
