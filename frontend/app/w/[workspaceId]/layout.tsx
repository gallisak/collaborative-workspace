import { WorkspaceLayout } from '@/app/layouts';

export default function Layout({ params, children }: LayoutProps<'/w/[workspaceId]'>) {
  return <WorkspaceLayout params={params}>{children}</WorkspaceLayout>;
}
