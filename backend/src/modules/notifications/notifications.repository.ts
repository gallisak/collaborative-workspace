import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaRepository } from '../../infra/prisma/unit-of-work.js';

const visible = (userId: string): Prisma.NotificationWhereInput => ({
  userId,
  document: { is: { deletedAt: null } },
  comment: { is: { deletedAt: null } },
});

@Injectable()
export class NotificationsRepository extends PrismaRepository {
  list(userId: string, limit: number, before?: string) {
    return this.prisma.notification.findMany({
      where: visible(userId),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      ...(before && { cursor: { id: before }, skip: 1 }),
      select: {
        id: true,
        type: true,
        readAt: true,
        createdAt: true,
        actor: { select: { id: true, name: true } },
        document: { select: { id: true, workspaceId: true, title: true } },
        comment: { select: { id: true, threadId: true, body: true } },
      },
    });
  }

  countUnread(userId: string) {
    return this.prisma.notification.count({ where: { ...visible(userId), readAt: null } });
  }

  async exists(userId: string, id: string) {
    const count = await this.prisma.notification.count({ where: { id, userId } });
    return count === 1;
  }

  async markRead(userId: string, id: string) {
    const { count } = await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
    return count === 1;
  }

  markAllRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  findMentionSource(commentId: string) {
    return this.prisma.comment.findFirst({
      where: { id: commentId, deletedAt: null, thread: { document: { deletedAt: null } } },
      select: {
        id: true,
        authorId: true,
        mentions: { select: { userId: true } },
        thread: { select: { document: { select: { id: true, workspaceId: true } } } },
      },
    });
  }

  async documentIdsInWorkspace(userId: string, workspaceId: string) {
    const rows = await this.prisma.notification.findMany({
      where: { userId, document: { is: { workspaceId } } },
      distinct: ['documentId'],
      select: { documentId: true },
    });
    return rows.flatMap((row) => (row.documentId ? [row.documentId] : []));
  }

  async recipientsOf(documentIds: string[]) {
    const rows = await this.prisma.notification.findMany({
      where: { documentId: { in: documentIds } },
      distinct: ['userId'],
      select: { userId: true },
    });
    return rows.map((row) => row.userId);
  }

  deleteForDocuments(userId: string, documentIds: string[]) {
    return this.prisma.notification.deleteMany({
      where: { userId, documentId: { in: documentIds } },
    });
  }

  async undeliveredMentionComments(createdAfter: Date, createdBefore: Date, limit: number) {
    const rows = await this.prisma.$queryRaw<{ comment_id: string }[]>`
      SELECT DISTINCT m.comment_id
      FROM comment_mentions m
      JOIN comments c ON c.id = m.comment_id
      WHERE c.deleted_at IS NULL
        AND c.created_at > ${createdAfter}
        AND c.created_at < ${createdBefore}
        AND m.user_id IS DISTINCT FROM c.author_id
        AND NOT EXISTS (
          SELECT 1 FROM notifications n
          WHERE n.dedupe_key = 'mention:' || m.comment_id || ':' || m.user_id
        )
      LIMIT ${limit}`;
    return rows.map((row) => row.comment_id);
  }

  createMany(data: Prisma.NotificationCreateManyInput[]) {
    return this.prisma.notification.createMany({ data, skipDuplicates: true });
  }
}
