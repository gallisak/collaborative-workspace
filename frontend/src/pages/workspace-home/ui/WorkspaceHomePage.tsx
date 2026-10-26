import { Suspense } from 'react';
import { canEditContent, ROLE_LABELS } from '@/entities/workspace';
import { load } from '@/shared/dal';
import { Badge } from '@/shared/ui/badge';
import { Skeleton } from '@/shared/ui/skeleton';
import { RootPages } from './RootPages';

interface WorkspaceHomePageProps {
  params: Promise<{ workspaceId: string }>;
}

async function Overview({ params }: WorkspaceHomePageProps) {
  const { workspaceId } = await params;
  const workspace = await load((api) =>
    api.GET('/api/workspaces/{workspaceId}', { params: { path: { workspaceId } } }),
  );
  return (
    <>
      <header className="grid gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">{workspace.name}</h1>
        <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="outline">{workspace.plan.name} plan</Badge>
          <span>
            {workspace.memberCount} member{workspace.memberCount === 1 ? '' : 's'}
          </span>
          <span>·</span>
          <span>You are {ROLE_LABELS[workspace.role].toLowerCase()}</span>
        </div>
      </header>
      <RootPages editable={canEditContent(workspace.role)} />
    </>
  );
}

export function WorkspaceHomePage(props: WorkspaceHomePageProps) {
  return (
    <main className="mx-auto grid w-full max-w-3xl gap-8 px-6 py-14">
      <Suspense
        fallback={
          <div className="grid gap-4">
            <Skeleton className="h-10 w-1/2" />
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-32" />
          </div>
        }
      >
        <Overview {...props} />
      </Suspense>
    </main>
  );
}
