import { Suspense } from 'react';
import { AcceptInvitationForm } from '@/features/accept-invitation';
import { getSessionUser } from '@/shared/dal';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';

interface AcceptInvitationPageProps {
  searchParams: Promise<{ token?: string | string[] }>;
}

async function Invitation({ searchParams }: AcceptInvitationPageProps) {
  const [{ token }, user] = await Promise.all([searchParams, getSessionUser()]);
  const value = typeof token === 'string' ? token : '';
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Join a workspace</CardTitle>
        <CardDescription>
          You are signed in as {user.email}. The invitation must be addressed to this email.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {value ? (
          <AcceptInvitationForm token={value} />
        ) : (
          <p className="text-destructive text-sm">This invitation link is not valid.</p>
        )}
      </CardContent>
    </Card>
  );
}

export function AcceptInvitationPage(props: AcceptInvitationPageProps) {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Suspense fallback={<Skeleton className="h-48 w-full max-w-sm" />}>
        <Invitation {...props} />
      </Suspense>
    </main>
  );
}
