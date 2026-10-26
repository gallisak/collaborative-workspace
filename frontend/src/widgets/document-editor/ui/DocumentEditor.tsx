'use client';

import { EditorContent, useEditor } from '@tiptap/react';
import Link from 'next/link';
import { useEffect } from 'react';
import { loginPath } from '@/shared/lib';
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';
import type { CollabSession } from '../model/collab-session';
import { OPEN_BLOCK_EVENT, setCommentHighlights } from '../model/comment-highlight';
import { editorExtensions } from '../model/extensions';
import { colorFor } from '../model/presence';
import { useCollabSession, useSessionSnapshot } from '../model/use-collab-session';
import { Collaborators } from './Collaborators';
import { ConnectionStatus } from './ConnectionStatus';
import { EditorToolbar } from './EditorToolbar';

interface EditorUser {
  id: string;
  name: string;
}

export interface CommentBinding {
  blockIds: readonly string[];
  activeBlockId: string | null;
  onOpenBlock: (blockId: string) => void;
  onComment?: (blockId: string) => void;
}

interface DocumentEditorProps {
  documentId: string;
  user: EditorUser;
  editable: boolean;
  comments: CommentBinding;
}

function EditorSkeleton() {
  return (
    <div className="grid gap-3 py-4" aria-busy="true" aria-label="Loading document">
      <Skeleton className="h-5 w-11/12" />
      <Skeleton className="h-5 w-10/12" />
      <Skeleton className="h-5 w-8/12" />
    </div>
  );
}

function CollaborativeEditor({
  session,
  user,
  editable,
  comments,
}: {
  session: CollabSession;
  user: EditorUser;
  editable: boolean;
  comments: CommentBinding;
}) {
  const snapshot = useSessionSnapshot(session);
  const editor = useEditor(
    {
      immediatelyRender: false,
      editable: false,
      extensions: editorExtensions(session, { name: user.name, color: colorFor(user.id) }),
      editorProps: {
        attributes: { class: 'document-content', 'aria-label': 'Document content' },
      },
    },
    [session],
  );
  const blocked = snapshot.state === 'lost-access' || snapshot.state === 'unauthorized';
  const writable = editable && snapshot.synced && !blocked;

  useEffect(() => {
    editor?.setEditable(writable);
  }, [editor, writable]);

  const { onOpenBlock } = comments;
  useEffect(() => {
    const element = editor?.view.dom;
    if (!element) {
      return;
    }
    const listener = (event: Event) => onOpenBlock((event as CustomEvent<string>).detail);
    element.addEventListener(OPEN_BLOCK_EVENT, listener);
    return () => element.removeEventListener(OPEN_BLOCK_EVENT, listener);
  }, [editor, onOpenBlock]);

  const highlightKey = comments.blockIds.join(',');
  useEffect(() => {
    if (editor && snapshot.synced) {
      setCommentHighlights(
        editor,
        highlightKey ? highlightKey.split(',') : [],
        comments.activeBlockId,
      );
    }
  }, [editor, snapshot.synced, highlightKey, comments.activeBlockId]);

  return (
    <div className="grid gap-2">
      <div className="flex min-h-7 items-center justify-between gap-3">
        <ConnectionStatus snapshot={snapshot} />
        <Collaborators session={session} selfId={user.id} />
      </div>
      {blocked && (
        <Alert variant="destructive">
          <AlertTitle>
            {snapshot.state === 'lost-access'
              ? 'This page is no longer available'
              : 'Session ended'}
          </AlertTitle>
          <AlertDescription>
            {snapshot.state === 'lost-access'
              ? 'Your access was revoked or the page was deleted. Edits are no longer saved.'
              : 'Sign in again to keep editing.'}
            {snapshot.state === 'unauthorized' && (
              <Button asChild size="sm" variant="outline" className="mt-2 w-fit">
                <Link href={loginPath(window.location.pathname)}>Sign in</Link>
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}
      {editor && editable && (
        <EditorToolbar editor={editor} disabled={!writable} onComment={comments.onComment} />
      )}
      {!snapshot.synced && <EditorSkeleton />}
      <EditorContent editor={editor} className={snapshot.synced ? undefined : 'hidden'} />
    </div>
  );
}

export function DocumentEditor({ documentId, user, editable, comments }: DocumentEditorProps) {
  const session = useCollabSession(documentId);
  if (!session) {
    return <EditorSkeleton />;
  }
  return (
    <CollaborativeEditor
      key={documentId}
      session={session}
      user={user}
      editable={editable}
      comments={comments}
    />
  );
}
