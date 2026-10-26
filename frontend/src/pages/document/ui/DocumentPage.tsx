import { Suspense } from 'react';
import { displayTitle } from '@/entities/document';
import { load } from '@/shared/dal';
import { Skeleton } from '@/shared/ui/skeleton';

interface DocumentPageProps {
  params: Promise<{ workspaceId: string; documentId: string }>;
}

async function DocumentView({ params }: DocumentPageProps) {
  const { documentId } = await params;
  const document = await load((api) =>
    api.GET('/api/documents/{documentId}', { params: { path: { documentId } } }),
  );
  return <h1 className="text-4xl font-bold tracking-tight">{displayTitle(document.title)}</h1>;
}

export function DocumentPage(props: DocumentPageProps) {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-14">
      <Suspense fallback={<Skeleton className="h-12 w-2/3" />}>
        <DocumentView {...props} />
      </Suspense>
    </main>
  );
}
