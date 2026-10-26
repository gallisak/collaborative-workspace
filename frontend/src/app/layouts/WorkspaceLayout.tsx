import { type ReactNode, Suspense } from 'react';
import { DocumentTreeProvider } from '@/entities/document';
import { canEditContent } from '@/entities/workspace';
import { getSessionUser, load, loadOptional } from '@/shared/dal';
import { Skeleton } from '@/shared/ui/skeleton';
import { NotificationsBell } from '@/widgets/notifications';
import { UserMenu } from '@/widgets/user-menu';
import { WorkspaceSidebar } from '@/widgets/workspace-sidebar';

interface WorkspaceLayoutProps {
  params: Promise<{ workspaceId: string }>;
  children: ReactNode;
}

async function WorkspaceShell({ params, children }: WorkspaceLayoutProps) {
  const { workspaceId } = await params;
  const path = { params: { path: { workspaceId } } };
  const [user, workspace] = await Promise.all([
    getSessionUser(),
    loadOptional((api) => api.GET('/api/workspaces/{workspaceId}', path)),
  ]);
  const [nodes, shared] = workspace
    ? [await load((api) => api.GET('/api/workspaces/{workspaceId}/documents', path)), []]
    : [
        [],
        (await load((api) => api.GET('/api/shared-documents'))).filter(
          (document) => document.workspaceId === workspaceId,
        ),
      ];

  return (
    <DocumentTreeProvider key={workspaceId} workspaceId={workspaceId} initialNodes={nodes}>
      <WorkspaceSidebar
        userMenu={<UserMenu user={user} />}
        notifications={<NotificationsBell />}
        workspaceId={workspaceId}
        workspace={workspace}
        shared={shared}
        editable={workspace ? canEditContent(workspace.role) : false}
      />
      <div className="min-w-0 flex-1 overflow-y-auto">{children}</div>
    </DocumentTreeProvider>
  );
}

function ShellSkeleton() {
  return (
    <>
      <div className="bg-sidebar hidden w-64 shrink-0 flex-col gap-2 border-r p-3 md:flex">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-6 w-4/5" />
      </div>
      <div className="flex-1 p-10">
        <Skeleton className="h-10 w-1/2" />
      </div>
    </>
  );
}

export function WorkspaceLayout(props: WorkspaceLayoutProps) {
  return (
    <div className="flex h-dvh">
      <Suspense fallback={<ShellSkeleton />}>
        <WorkspaceShell {...props} />
      </Suspense>
    </div>
  );
}
