import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, NotFoundException } from '@nestjs/common';
import type { Queue } from 'bullmq';
import {
  NOTIFICATIONS_QUEUE,
  NotificationJob,
  type NotifyMentionsJob,
} from '../../infra/queue/notification-jobs.js';
import type { NotificationDto } from './notifications.dto.js';
import { NotificationsRepository } from './notifications.repository.js';

const EXCERPT_LENGTH = 200;

@Injectable()
export class NotificationsService {
  constructor(
    private readonly notifications: NotificationsRepository,
    @InjectQueue(NOTIFICATIONS_QUEUE) private readonly queue: Queue,
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

  async notifyMentions(commentId: string) {
    const job: NotifyMentionsJob = { commentId };
    await this.queue.add(NotificationJob.NotifyMentions, job, { jobId: commentId });
  }
}
