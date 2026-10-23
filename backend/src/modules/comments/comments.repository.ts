import { Injectable } from '@nestjs/common';
import { PrismaRepository } from '../../infra/prisma/unit-of-work.js';

const user = { select: { id: true, name: true } } as const;

const commentSelect = {
  id: true,
  threadId: true,
  body: true,
  createdAt: true,
  author: user,
  mentions: { select: { user } },
} as const;

const threadSelect = {
  id: true,
  documentId: true,
  blockId: true,
  resolvedAt: true,
  createdAt: true,
  resolvedBy: user,
  comments: {
    where: { deletedAt: null },
    orderBy: { createdAt: 'asc' },
    select: commentSelect,
  },
} as const;

const alive = { deletedAt: null };

export interface NewComment {
  authorId: string;
  body: string;
  mentionedUserIds: string[];
}

const mentionRows = (userIds: string[]) => ({
  create: userIds.map((userId) => ({ userId })),
});

@Injectable()
export class CommentsRepository extends PrismaRepository {
  listThreads(documentId: string) {
    return this.prisma.commentThread.findMany({
      where: { documentId, comments: { some: alive } },
      orderBy: { createdAt: 'asc' },
      select: threadSelect,
    });
  }

  findThread(threadId: string) {
    return this.prisma.commentThread.findFirst({
      where: { id: threadId, comments: { some: alive } },
      select: { id: true, documentId: true },
    });
  }

  findComment(commentId: string) {
    return this.prisma.comment.findFirst({
      where: { id: commentId, ...alive },
      select: { id: true, authorId: true, thread: { select: { documentId: true } } },
    });
  }

  createThread(documentId: string, blockId: string, comment: NewComment) {
    return this.prisma.commentThread.create({
      data: {
        documentId,
        blockId,
        createdById: comment.authorId,
        comments: {
          create: {
            authorId: comment.authorId,
            body: comment.body,
            mentions: mentionRows(comment.mentionedUserIds),
          },
        },
      },
      select: threadSelect,
    });
  }

  createComment(threadId: string, comment: NewComment) {
    return this.prisma.comment.create({
      data: {
        threadId,
        authorId: comment.authorId,
        body: comment.body,
        mentions: mentionRows(comment.mentionedUserIds),
      },
      select: commentSelect,
    });
  }

  setResolved(threadId: string, resolvedById: string | null) {
    return this.prisma.commentThread.update({
      where: { id: threadId },
      data: { resolvedById, resolvedAt: resolvedById ? new Date() : null },
      select: threadSelect,
    });
  }

  softDeleteComment(commentId: string) {
    return this.prisma.comment.update({
      where: { id: commentId },
      data: { deletedAt: new Date() },
    });
  }
}
