export const NOTIFICATIONS_QUEUE = 'notifications';

export const NotificationJob = {
  NotifyMentions: 'mentions.notify',
  ReconcileMentions: 'mentions.reconcile',
} as const;

export interface NotifyMentionsJob {
  commentId: string;
}
