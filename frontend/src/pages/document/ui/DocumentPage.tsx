import { Suspense } from 'react';
import { displayTitle } from '@/entities/document';
import { TitleInput } from '@/features/rename-document';
import { getSessionUser, load } from '@/shared/dal';
import { Skeleton } from '@/shared/ui/skeleton';
import { DocumentEditor } from '@/widgets/document-editor';

interface DocumentPageProps {
  params: Promise<{ workspaceId: string; documentId: string }>;
}

async function DocumentView({ params }: DocumentPageProps) {
  const { documentId } = await params;
  const [document, user] = await Promise.all([
    load((api) => api.GET('/api/documents/{documentId}', { params: { path: { documentId } } })),
    getSessionUser(),
  ]);
  const editable = document.access === 'EDIT' || document.access === 'MANAGE';

  return (
    <article className="grid gap-4">
      {editable ? (
        <TitleInput key={document.id} documentId={document.id} title={document.title} />
      ) : (
        <h1 className="text-4xl font-bold tracking-tight">{displayTitle(document.title)}</h1>
      )}
      <DocumentEditor
        documentId={document.id}
        user={{ id: user.id, name: user.name }}
        editable={editable}
      />
    </article>
  );
}

export function DocumentPage(props: DocumentPageProps) {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-14">
      <Suspense
        fallback={
          <div className="grid gap-4">
            <Skeleton className="h-12 w-2/3" />
            <Skeleton className="h-40" />
          </div>
        }
      >
        <DocumentView {...props} />
      </Suspense>
    </main>
  );
}
