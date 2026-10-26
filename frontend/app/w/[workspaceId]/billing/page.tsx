import type { Metadata } from 'next';
import { WorkspaceBillingPage } from '@/pages/workspace-billing';

export const metadata: Metadata = { title: 'Billing' };

export default function Page({ params }: PageProps<'/w/[workspaceId]/billing'>) {
  return <WorkspaceBillingPage params={params} />;
}
