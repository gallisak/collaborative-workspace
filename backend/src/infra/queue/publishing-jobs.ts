export const PUBLISHING_QUEUE = 'publishing';

export const PublishingJob = {
  RevalidatePage: 'page.revalidate',
} as const;

export interface RevalidatePageJob {
  documentId: string;
}
