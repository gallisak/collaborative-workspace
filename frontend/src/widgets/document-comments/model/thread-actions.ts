'use client';

import { api, unwrap } from '@/shared/api';
import { notifyError } from '@/shared/lib';
import type { CommentDraft } from '@/features/write-comment';

async function attempt(action: () => Promise<unknown>) {
  try {
    await action();
    return true;
  } catch (error) {
    notifyError(error);
    return false;
  }
}

export const startThread = (documentId: string, blockId: string, draft: CommentDraft) =>
  attempt(async () =>
    unwrap(
      await api.POST('/api/documents/{documentId}/threads', {
        params: { path: { documentId } },
        body: { blockId, ...draft },
      }),
    ),
  );

export const replyToThread = (threadId: string, draft: CommentDraft) =>
  attempt(async () =>
    unwrap(
      await api.POST('/api/threads/{threadId}/comments', {
        params: { path: { threadId } },
        body: draft,
      }),
    ),
  );

export const setThreadResolved = (threadId: string, resolved: boolean) =>
  attempt(async () =>
    unwrap(
      await api.PATCH('/api/threads/{threadId}', {
        params: { path: { threadId } },
        body: { resolved },
      }),
    ),
  );

export const deleteComment = (commentId: string) =>
  attempt(async () =>
    unwrap(await api.DELETE('/api/comments/{commentId}', { params: { path: { commentId } } })),
  );
