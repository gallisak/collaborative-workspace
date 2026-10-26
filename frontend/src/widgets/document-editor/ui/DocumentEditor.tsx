'use client';

import { EditorContent, useEditor } from '@tiptap/react';
import Link from 'next/link';
import { useEffect } from 'react';
import { loginPath } from '@/shared/lib';
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';
import type { CollabSession } from '../model/collab-session';
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

interface DocumentEditorProps {
  documentId: string;
  user: EditorUser;
  editable: boolean;
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
}: {
  session: CollabSession;
  user: EditorUser;
  editable: boolean;
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
      {editor && editable && <EditorToolbar editor={editor} disabled={!writable} />}
      {!snapshot.synced && <EditorSkeleton />}
      <EditorContent editor={editor} className={snapshot.synced ? undefined : 'hidden'} />
    </div>
  );
}

export function DocumentEditor({ documentId, user, editable }: DocumentEditorProps) {
  const session = useCollabSession(documentId);
  if (!session) {
    return <EditorSkeleton />;
  }
  return <CollaborativeEditor key={documentId} session={session} user={user} editable={editable} />;
}
