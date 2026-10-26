import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Queue } from 'bullmq';
import {
  NOTIFICATIONS_QUEUE,
  NotificationJob,
  type NotifyMentionsJob,
} from '../../infra/queue/notification-jobs.js';
import { traced } from '../../infra/queue/traced-job.js';
import { DocumentAccessService } from '../permissions/document-access.service.js';
import type { NotificationDto } from './notifications.dto.js';
import { NotificationsRepository } from './notifications.repository.js';

const EXCERPT_LENGTH = 200;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly notifications: NotificationsRepository,
    @InjectQueue(NOTIFICATIONS_QUEUE) private readonly queue: Queue,
    private readonly documentAccess: DocumentAccessService,
  ) {}

  async list(userId: string, limit: number, before?: string): Promise<NotificationDto[]> {
    const rows = await this.notifications.list(userId, limit, before);
    return rows.map(({ comment, ...row }) => ({
      ...row,
      comment: comment && {
        id: comment.id,
        threadId: comment.threadId,
        excerpt: comment.body.slice(0, EXCERPT_LENGTH),
      },
    }));
  }

  async unreadCount(userId: string) {
    return { count: await this.notifications.countUnread(userId) };
  }

  async markRead(userId: string, id: string) {
    if (await this.notifications.markRead(userId, id)) {
      return;
    }
    if (!(await this.notifications.exists(userId, id))) {
      throw new NotFoundException('Notification not found');
    }
  }

  async markAllRead(userId: string) {
    await this.notifications.markAllRead(userId);
  }

  async pruneInaccessible(userId: string, workspaceId: string) {
    try {
      await this.deleteInaccessible(userId, workspaceId);
    } catch (error) {
      this.logger.warn({ err: error, userId, workspaceId }, 'Pruning notifications failed');
    }
  }

  async pruneForDocuments(workspaceId: string, documentIds: string[]) {
    try {
      const userIds = await this.notifications.recipientsOf(documentIds);
      for (const userId of userIds) {
        await this.deleteInaccessible(userId, workspaceId);
      }
    } catch (error) {
      this.logger.warn({ err: error, workspaceId }, 'Pruning notifications failed');
    }
  }

  private async deleteInaccessible(userId: string, workspaceId: string) {
    const documentIds = await this.notifications.documentIdsInWorkspace(userId, workspaceId);
    const access = await Promise.all(
      documentIds.map((id) => this.documentAccess.accessOf({ id, workspaceId }, userId)),
    );
    const hidden = documentIds.filter((_, index) => access[index] === 'NONE');
    if (hidden.length > 0) {
      await this.notifications.deleteForDocuments(userId, hidden);
    }
  }

  async notifyMentions(commentId: string) {
    const job: NotifyMentionsJob = { commentId };
    try {
      await this.queue.add(NotificationJob.NotifyMentions, traced(job), { jobId: commentId });
    } catch (error) {
      this.logger.warn(
        { err: error, commentId },
        'Scheduling mention notifications failed, the reconciliation picks them up',
      );
    }
  }
}
