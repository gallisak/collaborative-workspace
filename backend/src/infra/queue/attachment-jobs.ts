export const ATTACHMENTS_QUEUE = 'attachments';

export const AttachmentJob = {
  CleanupUploads: 'uploads.cleanup',
  PurgeWorkspace: 'workspace.purge',
  PurgeDocuments: 'documents.purge',
} as const;

export interface PurgeWorkspaceJob {
  workspaceId: string;
}

export interface PurgeDocumentsJob {
  documentIds: string[];
}
