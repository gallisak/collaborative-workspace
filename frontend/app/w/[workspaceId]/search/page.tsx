import type { Metadata } from 'next';
import { WorkspaceSearchPage } from '@/pages/workspace-search';

export const metadata: Metadata = { title: 'Search' };

export default function Page({ params, searchParams }: PageProps<'/w/[workspaceId]/search'>) {
  return <WorkspaceSearchPage params={params} searchParams={searchParams} />;
}
