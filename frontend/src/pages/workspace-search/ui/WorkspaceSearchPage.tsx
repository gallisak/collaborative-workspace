import { FileText, Search } from 'lucide-react';
import Form from 'next/form';
import Link from 'next/link';
import { Suspense } from 'react';
import { displayTitle } from '@/entities/document';
import { routes } from '@/shared/config';
import { load } from '@/shared/dal';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Skeleton } from '@/shared/ui/skeleton';

const MAX_QUERY_LENGTH = 200;

interface WorkspaceSearchPageProps {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ q?: string | string[] }>;
}

async function Results({ workspaceId, query }: { workspaceId: string; query: string }) {
  const hits = await load((api) =>
    api.GET('/api/workspaces/{workspaceId}/search', {
      params: { path: { workspaceId }, query: { q: query } },
    }),
  );
  if (hits.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Nothing matches “{query}”. Recent edits appear in search within a few seconds.
      </p>
    );
  }
  return (
    <ul className="grid gap-1" aria-label="Search results">
      {hits.map((hit) => (
        <li key={hit.id}>
          <Link
            href={routes.document(workspaceId, hit.id)}
            className="hover:bg-accent grid gap-1 rounded-md px-3 py-2"
          >
            <span className="flex items-center gap-2 font-medium">
              <FileText className="text-muted-foreground size-4 shrink-0" />
              {displayTitle(hit.title)}
            </span>
            {hit.snippet && (
              <span className="text-muted-foreground line-clamp-2 text-sm">{hit.snippet}</span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}

async function SearchView({ params, searchParams }: WorkspaceSearchPageProps) {
  const [{ workspaceId }, { q }] = await Promise.all([params, searchParams]);
  const query = typeof q === 'string' ? q.trim().slice(0, MAX_QUERY_LENGTH) : '';
  return (
    <>
      <Form action={routes.workspaceSearch(workspaceId)} role="search" className="flex gap-2">
        <Input
          name="q"
          type="search"
          defaultValue={query}
          placeholder="Search pages"
          aria-label="Search pages"
          maxLength={MAX_QUERY_LENGTH}
          autoFocus
        />
        <Button type="submit">
          <Search />
          Search
        </Button>
      </Form>
      {query ? (
        <Suspense
          key={query}
          fallback={
            <div className="grid gap-2" aria-busy="true" aria-label="Searching">
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </div>
          }
        >
          <Results workspaceId={workspaceId} query={query} />
        </Suspense>
      ) : (
        <p className="text-muted-foreground text-sm">
          Search titles and text of the pages you can open.
        </p>
      )}
    </>
  );
}

export function WorkspaceSearchPage(props: WorkspaceSearchPageProps) {
  return (
    <main className="mx-auto grid w-full max-w-3xl content-start gap-6 px-6 py-14">
      <h1 className="text-3xl font-semibold tracking-tight">Search</h1>
      <Suspense fallback={<Skeleton className="h-9" />}>
        <SearchView {...props} />
      </Suspense>
    </main>
  );
}
