'use client';

import { X } from 'lucide-react';
import { useState } from 'react';
import { CommentComposer, type MentionCandidate } from '@/features/write-comment';
import type { Thread } from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';
import { startThread } from '../model/thread-actions';
import { ThreadCard } from './ThreadCard';

interface CommentsPanelProps {
  documentId: string;
  userId: string;
  threads: Thread[] | null;
  canComment: boolean;
  canModerate: boolean;
  candidates: readonly MentionCandidate[];
  activeBlockId: string | null;
  pendingBlockId: string | null;
  onSelectBlock: (blockId: string) => void;
  onCancelPending: () => void;
  onChanged: () => Promise<void>;
  onClose: () => void;
}

export function CommentsPanel({
  documentId,
  userId,
  threads,
  canComment,
  canModerate,
  candidates,
  activeBlockId,
  pendingBlockId,
  onSelectBlock,
  onCancelPending,
  onChanged,
  onClose,
}: CommentsPanelProps) {
  const [showResolved, setShowResolved] = useState(false);
  const open = threads?.filter((thread) => thread.resolvedAt === null) ?? [];
  const resolved = threads?.filter((thread) => thread.resolvedAt !== null) ?? [];
  const visible = showResolved ? [...open, ...resolved] : open;

  return (
    <section aria-label="Comments" className="grid content-start gap-3">
      <header className="flex items-center justify-between">
        <h2 className="font-medium">Comments</h2>
        <Button variant="ghost" size="icon-sm" aria-label="Close comments" onClick={onClose}>
          <X />
        </Button>
      </header>
      {canComment && pendingBlockId && (
        <div className="grid gap-2 rounded-lg border border-dashed p-3">
          <p className="text-muted-foreground text-xs">New comment on the selected block</p>
          <CommentComposer
            autoFocus
            candidates={candidates}
            placeholder="Add a comment, type @ to mention someone"
            submitLabel="Comment"
            onCancel={onCancelPending}
            onSubmit={async (draft) => {
              const sent = await startThread(documentId, pendingBlockId, draft);
              if (sent) {
                await onChanged();
                onCancelPending();
              }
              return sent;
            }}
          />
        </div>
      )}
      {threads === null ? (
        <div className="grid gap-2">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : visible.length === 0 && !pendingBlockId ? (
        <p className="text-muted-foreground text-sm">
          {canComment
            ? 'No comments yet. Put the cursor in a block and use the comment button.'
            : 'No comments yet.'}
        </p>
      ) : (
        visible.map((thread) => (
          <ThreadCard
            key={thread.id}
            thread={thread}
            userId={userId}
            canComment={canComment}
            canModerate={canModerate}
            active={thread.blockId === activeBlockId}
            candidates={candidates}
            onSelect={() => onSelectBlock(thread.blockId)}
            onChanged={onChanged}
          />
        ))
      )}
      {resolved.length > 0 && (
        <Button variant="ghost" size="sm" onClick={() => setShowResolved((value) => !value)}>
          {showResolved ? 'Hide resolved' : `Show resolved (${resolved.length})`}
        </Button>
      )}
    </section>
  );
}
