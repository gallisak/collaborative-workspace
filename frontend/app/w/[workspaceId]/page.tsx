import { WorkspaceHomePage } from '@/pages/workspace-home';

export default function Page({ params }: PageProps<'/w/[workspaceId]'>) {
  return <WorkspaceHomePage params={params} />;
}
