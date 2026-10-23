import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import {
  NOTIFICATIONS_QUEUE,
  type NotifyMentionsJob,
} from '../../infra/queue/notification-jobs.js';
import { DocumentAccessService } from '../permissions/document-access.service.js';
import { mentionDedupeKey, mentionRecipients } from './mention-recipients.js';
import { NotificationsRepository } from './notifications.repository.js';

@Processor(NOTIFICATIONS_QUEUE)
export class MentionsProcessor extends WorkerHost {
  private readonly logger = new Logger(MentionsProcessor.name);

  constructor(
    private readonly notifications: NotificationsRepository,
    private readonly documentAccess: DocumentAccessService,
  ) {
    super();
  }

  async process({ data: { commentId } }: Job<NotifyMentionsJob>) {
    const comment = await this.notifications.findMentionSource(commentId);
    if (!comment) {
      this.logger.warn({ commentId }, 'Skipping mentions of a deleted comment');
      return;
    }
    const { document } = comment.thread;
    const mentions = await Promise.all(
      comment.mentions.map(async ({ userId }) => ({
        userId,
        access: await this.documentAccess.accessOf(document, userId),
      })),
    );
    const recipients = mentionRecipients(comment.authorId, mentions);
    const { count } = await this.notifications.createMany(
      recipients.map((userId) => ({
        userId,
        type: 'MENTION',
        actorId: comment.authorId,
        documentId: document.id,
        commentId,
        dedupeKey: mentionDedupeKey(commentId, userId),
      })),
    );
    this.logger.log({ commentId, documentId: document.id, created: count }, 'Mentions notified');
  }
}
