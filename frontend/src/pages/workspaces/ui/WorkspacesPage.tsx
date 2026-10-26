import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import { ROLE_LABELS } from '@/entities/workspace';
import { CreateWorkspaceForm } from '@/features/create-workspace';
import { getSessionUser, load } from '@/shared/dal';
import { routes } from '@/shared/config';
import { Badge } from '@/shared/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';
import { UserMenu } from '@/widgets/user-menu';

async function Header() {
  const user = await getSessionUser();
  return (
    <div className="w-48">
      <UserMenu user={user} />
    </div>
  );
}

async function WorkspaceList() {
  const workspaces = await load((api) => api.GET('/api/workspaces'));
  if (workspaces.length === 0) {
    return (
      <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
        You are not a member of any workspace yet. Create one below or ask a teammate for an
        invitation.
      </p>
    );
  }
  return (
    <ul className="grid gap-2">
      {workspaces.map((workspace) => (
        <li key={workspace.id}>
          <Link
            href={routes.workspace(workspace.id)}
            className="hover:bg-accent flex items-center gap-3 rounded-lg border p-4 transition-colors"
          >
            <span className="flex-1 truncate font-medium">{workspace.name}</span>
            <Badge variant="secondary">{ROLE_LABELS[workspace.role]}</Badge>
            <Badge variant="outline">{workspace.planId}</Badge>
            <ChevronRight className="text-muted-foreground size-4" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function WorkspacesPage() {
  return (
    <main className="mx-auto grid w-full max-w-2xl gap-8 p-6 md:py-12">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Your workspaces</h1>
        <Suspense fallback={<Skeleton className="h-9 w-48" />}>
          <Header />
        </Suspense>
      </header>
      <Suspense
        fallback={
          <div className="grid gap-2">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        }
      >
        <WorkspaceList />
      </Suspense>
      <Card>
        <CardHeader>
          <CardTitle>New workspace</CardTitle>
          <CardDescription>Starts on the Free plan, you can upgrade any time.</CardDescription>
        </CardHeader>
        <CardContent>
          <CreateWorkspaceForm />
        </CardContent>
      </Card>
    </main>
  );
}
