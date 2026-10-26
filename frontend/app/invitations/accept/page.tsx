import type { Metadata } from 'next';
import { AcceptInvitationPage } from '@/pages/accept-invitation';

export const metadata: Metadata = { title: 'Join a workspace' };

export default function Page({ searchParams }: PageProps<'/invitations/accept'>) {
  return <AcceptInvitationPage searchParams={searchParams} />;
}
