'use client';

import { History, MessageSquare } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { displayTitle } from '@/entities/document';
import { TitleInput } from '@/features/rename-document';
import { ShareMenu } from '@/features/share-document';
import type { MentionCandidate } from '@/features/write-comment';
import type { ShareLink } from '@/shared/api';
import { cn } from '@/shared/lib';
import { Button } from '@/shared/ui/button';
import { CommentsPanel, useThreads } from '@/widgets/document-comments';
import { DocumentEditor } from '@/widgets/document-editor';
import { HistoryPanel } from '@/widgets/document-history';

type Panel = 'comments' | 'history' | null;

interface DocumentWorkspaceProps {
  documentId: string;
  title: string;
  user: { id: string; name: string };
  editable: boolean;
  canModerate: boolean;
  shareLinks: ShareLink[];
  candidates: MentionCandidate[];
}

export function DocumentWorkspace({
  documentId,
  title,
  user,
  editable,
  canModerate,
  shareLinks,
  candidates,
}: DocumentWorkspaceProps) {
  const linkedThread = useSearchParams()?.get('thread') ?? null;
  const { threads, reload } = useThreads(documentId);
  const [panel, setPanel] = useState<Panel>(linkedThread ? 'comments' : null);
  const [pendingBlockId, setPendingBlockId] = useState<string | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [shownThread, setShownThread] = useState(linkedThread);
  if (linkedThread !== shownThread) {
    setShownThread(linkedThread);
    if (linkedThread) {
      setPanel('comments');
      setSelectedBlockId(null);
    }
  }

  const linkedBlockId = threads?.find((thread) => thread.id === linkedThread)?.blockId ?? null;
  const activeBlockId = selectedBlockId ?? linkedBlockId;
  const openThreads = useMemo(
    () => threads?.filter((thread) => thread.resolvedAt === null) ?? [],
    [threads],
  );
  const blockIds = useMemo(() => openThreads.map((thread) => thread.blockId), [openThreads]);

  const selectBlock = useCallback((blockId: string) => {
    setPanel('comments');
    setSelectedBlockId(blockId);
    document
      .querySelector(`[data-id="${CSS.escape(blockId)}"]`)
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, []);

  const comments = useMemo(
    () => ({
      blockIds,
      activeBlockId,
      onOpenBlock: selectBlock,
      onComment: editable
        ? (blockId: string) => {
            setPanel('comments');
            setPendingBlockId(blockId);
            setSelectedBlockId(blockId);
          }
        : undefined,
    }),
    [blockIds, activeBlockId, selectBlock, editable],
  );

  const toggle = (next: Exclude<Panel, null>) =>
    setPanel((current) => (current === next ? null : next));

  return (
    <main className="flex min-h-full">
      <article className="mx-auto grid w-full max-w-3xl content-start gap-4 px-6 py-14">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            {editable ? (
              <TitleInput key={documentId} documentId={documentId} title={title} />
            ) : (
              <h1 className="text-4xl font-bold tracking-tight">{displayTitle(title)}</h1>
            )}
          </div>
          <div className="flex shrink-0 gap-1 pt-2">
            {canModerate && <ShareMenu documentId={documentId} links={shareLinks} />}
            <Button
              variant="ghost"
              size="sm"
              aria-pressed={panel === 'comments'}
              className={cn(panel === 'comments' && 'bg-accent')}
              onClick={() => toggle('comments')}
            >
              <MessageSquare />
              Comments{openThreads.length > 0 ? ` (${openThreads.length})` : ''}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-pressed={panel === 'history'}
              className={cn(panel === 'history' && 'bg-accent')}
              onClick={() => toggle('history')}
            >
              <History />
              History
            </Button>
          </div>
        </div>
        <DocumentEditor
          documentId={documentId}
          user={user}
          editable={editable}
          comments={comments}
        />
      </article>
      {panel && (
        <aside className="bg-background sticky top-0 h-dvh w-80 shrink-0 overflow-y-auto border-l p-4">
          {panel === 'comments' ? (
            <CommentsPanel
              documentId={documentId}
              userId={user.id}
              threads={threads}
              canComment={editable}
              canModerate={canModerate}
              candidates={candidates}
              activeBlockId={activeBlockId}
              pendingBlockId={pendingBlockId}
              onSelectBlock={selectBlock}
              onCancelPending={() => setPendingBlockId(null)}
              onChanged={reload}
              onClose={() => setPanel(null)}
            />
          ) : (
            <HistoryPanel
              documentId={documentId}
              canEdit={editable}
              onClose={() => setPanel(null)}
            />
          )}
        </aside>
      )}
    </main>
  );
}
