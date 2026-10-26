export const ATTACHMENTS_QUEUE = 'attachments';

export const AttachmentJob = {
  CleanupUploads: 'uploads.cleanup',
  PurgeWorkspace: 'workspace.purge',
} as const;

export interface PurgeWorkspaceJob {
  workspaceId: string;
}
