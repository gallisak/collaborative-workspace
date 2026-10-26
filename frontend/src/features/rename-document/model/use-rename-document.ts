'use client';

import { useOptionalDocumentTree } from '@/entities/document';
import { api, unwrap } from '@/shared/api';
import { notifyError } from '@/shared/lib';

export const MAX_TITLE_LENGTH = 200;

export function useRenameDocument() {
  const tree = useOptionalDocumentTree();

  return async (documentId: string, title: string, previous: string) => {
    const next = title.trim().slice(0, MAX_TITLE_LENGTH);
    if (next === previous) {
      return true;
    }
    tree?.renameLocally(documentId, next);
    try {
      unwrap(
        await api.PATCH('/api/documents/{documentId}', {
          params: { path: { documentId } },
          body: { title: next },
        }),
      );
      return true;
    } catch (error) {
      tree?.renameLocally(documentId, previous);
      notifyError(error);
      return false;
    }
  };
}
