import type { ReactNode } from 'react';
import { Suspense } from 'react';
import { canEditContent, ROLE_LABELS } from '@/entities/workspace';
import { load } from '@/shared/dal';
import { Badge } from '@/shared/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { SectionBoundary } from '@/shared/ui/section-boundary';
import { Skeleton } from '@/shared/ui/skeleton';
import { MembersSection, MentionsSection, PlanSection } from './DashboardSections';
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

function SectionSkeleton({ title }: { title: string }) {
  return (
    <div className="grid gap-2" aria-busy="true" aria-label={`Loading ${title.toLowerCase()}`}>
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="h-5 w-1/2" />
      <Skeleton className="h-5 w-2/3" />
    </div>
  );
}

function DashboardCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card size="sm" aria-label={title} role="region">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function WorkspaceHomePage(props: WorkspaceHomePageProps) {
  const sections = [
    { title: 'Mentions', Content: MentionsSection },
    { title: 'Members', Content: MembersSection },
    { title: 'Plan usage', Content: PlanSection },
  ];
  return (
    <main className="mx-auto grid w-full max-w-5xl gap-8 px-6 py-14 lg:grid-cols-[1fr_18rem]">
      <div className="grid content-start gap-8">
        <SectionBoundary title="Overview">
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
        </SectionBoundary>
      </div>
      <aside className="grid content-start gap-4" aria-label="Workspace overview">
        {sections.map(({ title, Content }) => (
          <DashboardCard key={title} title={title}>
            <SectionBoundary title={title}>
              <Suspense fallback={<SectionSkeleton title={title} />}>
                <Content params={props.params} />
              </Suspense>
            </SectionBoundary>
          </DashboardCard>
        ))}
      </aside>
    </main>
  );
}
