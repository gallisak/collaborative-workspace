import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/shared/config';
import { getSessionUser, load, loadOptional } from '@/shared/dal';
import { Skeleton } from '@/shared/ui/skeleton';
import { DocumentWorkspace } from './DocumentWorkspace';

interface DocumentPageProps {
  params: Promise<{ workspaceId: string; documentId: string }>;
}

async function DocumentView({ params }: DocumentPageProps) {
  const { workspaceId, documentId } = await params;
  const path = { params: { path: { documentId } } };
  const [document, user, members] = await Promise.all([
    load((api) => api.GET('/api/documents/{documentId}', path)),
    getSessionUser(),
    loadOptional((api) =>
      api.GET('/api/workspaces/{workspaceId}/members', { params: { path: { workspaceId } } }),
    ),
  ]);
  if (document.workspaceId !== workspaceId) {
    redirect(routes.document(document.workspaceId, document.id));
  }
  const canModerate = document.access === 'MANAGE';
  const [grants, shareLinks] = canModerate
    ? await Promise.all([
        load((api) => api.GET('/api/documents/{documentId}/permissions', path)),
        load((api) => api.GET('/api/documents/{documentId}/share-links', path)),
      ])
    : [[], []];
  const candidates = new Map(
    [...(members ?? []), ...grants]
      .filter((person) => person.userId !== user.id)
      .map((person) => [person.userId, { id: person.userId, name: person.name }]),
  );

  return (
    <DocumentWorkspace
      documentId={document.id}
      title={document.title}
      user={{ id: user.id, name: user.name }}
      editable={document.access === 'EDIT' || canModerate}
      canModerate={canModerate}
      shareLinks={shareLinks}
      candidates={[...candidates.values()]}
    />
  );
}

export function DocumentPage(props: DocumentPageProps) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto grid w-full max-w-3xl gap-4 px-6 py-14">
          <Skeleton className="h-12 w-2/3" />
          <Skeleton className="h-40" />
        </div>
      }
    >
      <DocumentView {...props} />
    </Suspense>
  );
}
