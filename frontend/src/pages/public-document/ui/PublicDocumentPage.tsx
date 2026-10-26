import { PenLine } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { displayTitle } from '@/entities/document';
import { getPublicDocument, PublicBlocks } from '@/entities/public-document';
import { routes } from '@/shared/config';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';

interface PublicDocumentPageProps {
  params: Promise<{ token: string }>;
}

export async function generatePublicDocumentMetadata({
  params,
}: PublicDocumentPageProps): Promise<Metadata> {
  const { token } = await params;
  const document = await getPublicDocument(token);
  if (!document) {
    return { title: 'Page not found', robots: { index: false } };
  }
  const title = displayTitle(document.title);
  const url = routes.publicPage(token);
  return {
    title,
    description: document.description || undefined,
    alternates: { canonical: url },
    openGraph: {
      type: 'article',
      url,
      title,
      description: document.description || undefined,
    },
  };
}

async function PublicDocumentView({ params }: PublicDocumentPageProps) {
  const { token } = await params;
  const document = await getPublicDocument(token);
  if (!document) {
    notFound();
  }
  return (
    <>
      {document.accessLevel === 'EDIT' && (
        <Button asChild variant="outline" size="sm" className="w-fit">
          <Link href={routes.sharedDocument(token)} prefetch={false}>
            <PenLine />
            Edit this page
          </Link>
        </Button>
      )}
      <h1 className="text-4xl font-bold tracking-tight">{displayTitle(document.title)}</h1>
      <PublicBlocks blocks={document.blocks} />
    </>
  );
}

function PublicDocumentSkeleton() {
  return (
    <div className="grid gap-4" aria-busy="true" aria-label="Loading page">
      <Skeleton className="h-12 w-2/3" />
      <Skeleton className="h-5 w-11/12" />
      <Skeleton className="h-5 w-9/12" />
    </div>
  );
}

export function PublicDocumentPage(props: PublicDocumentPageProps) {
  return (
    <>
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-3xl items-center px-6 py-3">
          <Link href={routes.home} className="text-sm font-semibold">
            Collab Docs
          </Link>
        </div>
      </header>
      <main className="flex-1">
        <article className="mx-auto grid w-full max-w-3xl content-start gap-4 px-6 py-14">
          <Suspense fallback={<PublicDocumentSkeleton />}>
            <PublicDocumentView {...props} />
          </Suspense>
        </article>
      </main>
    </>
  );
}
