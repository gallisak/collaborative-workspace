import { InjectQueue, Processor } from '@nestjs/bullmq';
import { Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import {
  NOTIFICATIONS_QUEUE,
  NotificationJob,
  type NotifyMentionsJob,
} from '../../infra/queue/notification-jobs.js';
import { traced, TracedWorkerHost } from '../../infra/queue/traced-job.js';
import { DocumentAccessService } from '../permissions/document-access.service.js';
import { mentionDedupeKey, mentionRecipients } from './mention-recipients.js';
import { NotificationsRepository } from './notifications.repository.js';

const RECONCILE_EVERY_MS = 5 * 60_000;
const RECONCILE_WINDOW_MS = 24 * 60 * 60_000;
const RECONCILE_GRACE_MS = 60_000;
const RECONCILE_BATCH = 500;

@Processor(NOTIFICATIONS_QUEUE)
export class MentionsProcessor extends TracedWorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger(MentionsProcessor.name);

  constructor(
    private readonly notifications: NotificationsRepository,
    private readonly documentAccess: DocumentAccessService,
    @InjectQueue(NOTIFICATIONS_QUEUE) private readonly queue: Queue,
  ) {
    super();
  }

  async onApplicationBootstrap() {
    await this.queue.upsertJobScheduler(
      NotificationJob.ReconcileMentions,
      { every: RECONCILE_EVERY_MS },
      { name: NotificationJob.ReconcileMentions },
    );
  }

  protected async handle(job: Job<NotifyMentionsJob>) {
    switch (job.name) {
      case NotificationJob.NotifyMentions:
        return this.notify(job.data.commentId);
      case NotificationJob.ReconcileMentions:
        return this.reconcile();
      default:
        throw new Error(`Unknown notifications job ${job.name}`);
    }
  }

  async notify(commentId: string) {
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

  private async reconcile() {
    const now = Date.now();
    const commentIds = await this.notifications.undeliveredMentionComments(
      new Date(now - RECONCILE_WINDOW_MS),
      new Date(now - RECONCILE_GRACE_MS),
      RECONCILE_BATCH,
    );
    await Promise.all(
      commentIds.map((commentId) => {
        const job: NotifyMentionsJob = { commentId };
        return this.queue.add(NotificationJob.NotifyMentions, traced(job), { jobId: commentId });
      }),
    );
    if (commentIds.length > 0) {
      this.logger.log({ comments: commentIds.length }, 'Undelivered mentions rescheduled');
    }
  }
}
