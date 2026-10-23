import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Document } from '../../generated/prisma/client.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { canManage, canView } from '../permissions/document-access.js';
import { DocumentAccessService } from '../permissions/document-access.service.js';
import type {
  CommentDto,
  CommentUserDto,
  CreateCommentDto,
  CreateThreadDto,
  ThreadDto,
} from './comments.dto.js';
import { CommentsRepository } from './comments.repository.js';

type CommentRow = Omit<CommentDto, 'mentions'> & { mentions: { user: CommentUserDto }[] };
type ThreadRow = Omit<ThreadDto, 'comments'> & { comments: CommentRow[] };

const toComment = ({ mentions, ...comment }: CommentRow): CommentDto => ({
  ...comment,
  mentions: mentions.map(({ user }) => user),
});

const toThread = ({ comments, ...thread }: ThreadRow): ThreadDto => ({
  ...thread,
  comments: comments.map(toComment),
});

@Injectable()
export class CommentsService {
  private readonly logger = new Logger(CommentsService.name);

  constructor(
    private readonly comments: CommentsRepository,
    private readonly documentAccess: DocumentAccessService,
    private readonly notifications: NotificationsService,
  ) {}

  async listThreads(userId: string, documentId: string): Promise<ThreadDto[]> {
    await this.documentAccess.require(documentId, userId, 'VIEW');
    return (await this.comments.listThreads(documentId)).map(toThread);
  }

  async createThread(userId: string, documentId: string, dto: CreateThreadDto): Promise<ThreadDto> {
    const { document } = await this.documentAccess.require(documentId, userId, 'EDIT');
    const mentionedUserIds = await this.validMentions(document, dto.mentionedUserIds);
    const thread = await this.comments.createThread(documentId, dto.blockId, {
      authorId: userId,
      body: dto.body,
      mentionedUserIds,
    });
    await this.afterComment(thread.comments[0].id, mentionedUserIds);
    return toThread(thread);
  }

  async reply(userId: string, threadId: string, dto: CreateCommentDto): Promise<CommentDto> {
    const thread = await this.findThread(threadId);
    const { document } = await this.documentAccess.require(thread.documentId, userId, 'EDIT');
    const mentionedUserIds = await this.validMentions(document, dto.mentionedUserIds);
    const comment = await this.comments.createComment(threadId, {
      authorId: userId,
      body: dto.body,
      mentionedUserIds,
    });
    await this.afterComment(comment.id, mentionedUserIds);
    return toComment(comment);
  }

  async setResolved(userId: string, threadId: string, resolved: boolean): Promise<ThreadDto> {
    const thread = await this.findThread(threadId);
    await this.documentAccess.require(thread.documentId, userId, 'EDIT');
    return toThread(await this.comments.setResolved(threadId, resolved ? userId : null));
  }

  async deleteComment(userId: string, commentId: string) {
    const comment = await this.comments.findComment(commentId);
    if (!comment) {
      throw new NotFoundException('Comment not found');
    }
    const { access } = await this.documentAccess.require(comment.thread.documentId, userId, 'VIEW');
    if (comment.authorId !== userId && !canManage(access)) {
      throw new ForbiddenException('Only the author or a document manager can delete a comment');
    }
    await this.comments.softDeleteComment(commentId);
  }

  private async findThread(threadId: string) {
    const thread = await this.comments.findThread(threadId);
    if (!thread) {
      throw new NotFoundException('Thread not found');
    }
    return thread;
  }

  private async validMentions(document: Document, userIds: string[] = []) {
    const unique = [...new Set(userIds)];
    const access = await Promise.all(
      unique.map((id) => this.documentAccess.accessOf(document, id)),
    );
    if (!access.every(canView)) {
      throw new BadRequestException('Mentioned users must have access to the document');
    }
    return unique;
  }

  private async afterComment(commentId: string, mentionedUserIds: string[]) {
    if (mentionedUserIds.length > 0) {
      await this.notifications.notifyMentions(commentId);
    }
    this.logger.log({ commentId, mentions: mentionedUserIds.length }, 'Comment added');
  }
}
