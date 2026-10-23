export const NOTIFICATIONS_QUEUE = 'notifications';

export const NotificationJob = {
  NotifyMentions: 'mentions.notify',
} as const;

export interface NotifyMentionsJob {
  commentId: string;
}
