'use client';

import { CheckCircle2, RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { CommentComposer, type MentionCandidate } from '@/features/write-comment';
import type { Thread } from '@/shared/api';
import { cn, relativeTime } from '@/shared/lib';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { deleteComment, replyToThread, setThreadResolved } from '../model/thread-actions';
import { CommentBody } from './CommentBody';

interface ThreadCardProps {
  thread: Thread;
  userId: string;
  canComment: boolean;
  canModerate: boolean;
  active: boolean;
  candidates: readonly MentionCandidate[];
  onSelect: () => void;
  onChanged: () => Promise<void>;
}

export function ThreadCard({
  thread,
  userId,
  canComment,
  canModerate,
  active,
  candidates,
  onSelect,
  onChanged,
}: ThreadCardProps) {
  const [replying, setReplying] = useState(false);
  const resolved = thread.resolvedAt !== null;

  const run = async (action: () => Promise<boolean>) => {
    const ok = await action();
    if (ok) {
      await onChanged();
    }
    return ok;
  };

  return (
    <article
      aria-label={`Thread by ${thread.comments[0]?.author?.name ?? 'a former member'}`}
      className={cn(
        'grid gap-3 rounded-lg border p-3 transition-colors',
        active && 'border-ring ring-ring/30 ring-2',
        resolved && 'opacity-70',
      )}
      onClick={onSelect}
    >
      {resolved && (
        <Badge variant="secondary" className="w-fit">
          Resolved{thread.resolvedBy ? ` by ${thread.resolvedBy.name}` : ''}
        </Badge>
      )}
      <ol className="grid gap-3">
        {thread.comments.map((comment) => (
          <li key={comment.id} className="group grid gap-1">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-medium">{comment.author?.name ?? 'Former member'}</span>
              <time className="text-muted-foreground" dateTime={comment.createdAt}>
                {relativeTime(comment.createdAt)}
              </time>
              {(comment.author?.id === userId || canModerate) && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="ml-auto opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                  aria-label="Delete comment"
                  onClick={(event) => {
                    event.stopPropagation();
                    void run(() => deleteComment(comment.id));
                  }}
                >
                  <Trash2 />
                </Button>
              )}
            </div>
            <CommentBody comment={comment} />
          </li>
        ))}
      </ol>
      {canComment && (
        <div
          className="flex flex-wrap items-center gap-1"
          onClick={(event) => event.stopPropagation()}
        >
          {!replying && (
            <Button variant="ghost" size="sm" onClick={() => setReplying(true)}>
              Reply
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void run(() => setThreadResolved(thread.id, !resolved))}
          >
            {resolved ? <RotateCcw /> : <CheckCircle2 />}
            {resolved ? 'Reopen' : 'Resolve'}
          </Button>
          {replying && (
            <div className="w-full">
              <CommentComposer
                autoFocus
                candidates={candidates}
                placeholder="Reply…"
                submitLabel="Reply"
                onCancel={() => setReplying(false)}
                onSubmit={async (draft) => {
                  const sent = await run(() => replyToThread(thread.id, draft));
                  if (sent) {
                    setReplying(false);
                  }
                  return sent;
                }}
              />
            </div>
          )}
        </div>
      )}
    </article>
  );
}
