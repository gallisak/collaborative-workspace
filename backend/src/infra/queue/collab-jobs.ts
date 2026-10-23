export const COLLAB_QUEUE = 'collab';

export const CollabJob = {
  CreateVersion: 'version.create',
  RestoreVersion: 'version.restore',
} as const;

export interface CreateVersionJob {
  documentId: string;
  workspaceId: string;
  userId: string;
  name: string | null;
}

export interface RestoreVersionJob {
  documentId: string;
  workspaceId: string;
  userId: string;
  versionId: string;
}
