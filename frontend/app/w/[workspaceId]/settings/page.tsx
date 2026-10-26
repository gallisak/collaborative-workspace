import type { Metadata } from 'next';
import { WorkspaceSettingsPage } from '@/pages/workspace-settings';

export const metadata: Metadata = { title: 'Settings' };

export default function Page({ params }: PageProps<'/w/[workspaceId]/settings'>) {
  return <WorkspaceSettingsPage params={params} />;
}
