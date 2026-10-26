import { CreditCard } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { formatAmount, formatPrice } from '@/entities/plan';
import { PayButton } from '@/features/change-plan';
import { routes } from '@/shared/config';
import { load } from '@/shared/dal';
import { idSchema } from '@/shared/lib';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';

interface CheckoutPageProps {
  params: Promise<{ sessionId: string }>;
}

const STATUS_TEXT = {
  COMPLETED: 'This checkout is already paid.',
  EXPIRED: 'This checkout has expired. Start a new one from the billing page.',
} as const;

async function Checkout({ params }: CheckoutPageProps) {
  const { sessionId } = await params;
  if (!idSchema.safeParse(sessionId).success) {
    notFound();
  }
  const session = await load((api) =>
    api.GET('/api/billing/checkout-sessions/{sessionId}', {
      params: { path: { sessionId } },
    }),
  );
  const billingPath = routes.workspaceBilling(session.workspaceId);

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="size-5" />
          {session.plan.name} plan
        </CardTitle>
        <CardDescription>
          {formatPrice(session.plan.priceMinor)} · Test payment, no card is charged.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {session.status === 'OPEN' ? (
          <PayButton
            sessionId={session.id}
            workspaceId={session.workspaceId}
            amount={formatAmount(session.plan.priceMinor)}
            planName={session.plan.name}
          />
        ) : (
          <p className="text-muted-foreground text-sm">{STATUS_TEXT[session.status]}</p>
        )}
        <Button asChild variant="ghost">
          <Link href={billingPath}>Back to billing</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export function CheckoutPage(props: CheckoutPageProps) {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Suspense fallback={<Skeleton className="h-56 w-full max-w-md" />}>
        <Checkout {...props} />
      </Suspense>
    </main>
  );
}
