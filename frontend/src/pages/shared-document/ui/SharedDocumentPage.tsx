import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { displayTitle } from '@/entities/document';
import { getPublicDocument } from '@/entities/public-document';
import { routes } from '@/shared/config';
import { getSessionUser } from '@/shared/dal';
import { Skeleton } from '@/shared/ui/skeleton';
import { DocumentEditor } from '@/widgets/document-editor';

interface SharedDocumentPageProps {
  params: Promise<{ token: string }>;
}

export async function generateSharedDocumentMetadata({
  params,
}: SharedDocumentPageProps): Promise<Metadata> {
  const { token } = await params;
  const document = await getPublicDocument(token);
  return {
    title: document ? displayTitle(document.title) : 'Page not found',
    robots: { index: false },
  };
}

async function SharedDocumentView({ params }: SharedDocumentPageProps) {
  const { token } = await params;
  const [document, user] = await Promise.all([getPublicDocument(token), getSessionUser()]);
  if (!document) {
    notFound();
  }
  if (document.accessLevel !== 'EDIT') {
    redirect(routes.publicPage(token));
  }
  return (
    <>
      <p className="text-muted-foreground text-sm">Editing through a shared link</p>
      <h1 className="text-4xl font-bold tracking-tight">{displayTitle(document.title)}</h1>
      <DocumentEditor
        documentId={document.id}
        shareToken={token}
        user={{ id: user.id, name: user.name }}
        editable
      />
    </>
  );
}

export function SharedDocumentPage(props: SharedDocumentPageProps) {
  return (
    <>
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-3xl items-center px-6 py-3">
          <Link href={routes.workspaces} className="text-sm font-semibold">
            Collab Docs
          </Link>
        </div>
      </header>
      <main className="flex-1">
        <article className="mx-auto grid w-full max-w-3xl content-start gap-4 px-6 py-14">
          <Suspense
            fallback={
              <div className="grid gap-4" aria-busy="true" aria-label="Loading page">
                <Skeleton className="h-12 w-2/3" />
                <Skeleton className="h-40" />
              </div>
            }
          >
            <SharedDocumentView {...props} />
          </Suspense>
        </article>
      </main>
    </>
  );
}
