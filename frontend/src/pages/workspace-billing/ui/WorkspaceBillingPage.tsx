import { Check } from 'lucide-react';
import { Suspense } from 'react';
import { formatBytes, formatLimit, formatPrice, SeatsMeter, UsageMeter } from '@/entities/plan';
import { canManageBilling } from '@/entities/workspace';
import { UpgradeButton } from '@/features/change-plan';
import type { Plan } from '@/shared/api';
import { load } from '@/shared/dal';
import { cn } from '@/shared/lib';
import { Badge } from '@/shared/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';

interface WorkspaceBillingPageProps {
  params: Promise<{ workspaceId: string }>;
}

const dateFormat = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' });

const planFeatures = (plan: Plan) => [
  `${formatLimit(plan.maxMembers)} members`,
  `${formatLimit(plan.maxDocuments)} documents`,
  `${formatLimit(plan.maxStorageBytes, formatBytes)} storage`,
];

async function Billing({ params }: WorkspaceBillingPageProps) {
  const { workspaceId } = await params;
  const path = { params: { path: { workspaceId } } };
  const [workspace, billing, plans] = await Promise.all([
    load((api) => api.GET('/api/workspaces/{workspaceId}', path)),
    load((api) => api.GET('/api/workspaces/{workspaceId}/billing', path)),
    load((api) => api.GET('/api/billing/plans')),
  ]);
  const manager = canManageBilling(workspace.role);
  const { plan, subscription, usage } = billing;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{plan.name} plan</CardTitle>
          <CardDescription>
            {subscription
              ? `${subscription.status === 'ACTIVE' ? 'Renews' : 'Ends'} on ${dateFormat.format(new Date(subscription.currentPeriodEnd))}`
              : 'No subscription. Upgrade to raise the limits.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <SeatsMeter usage={usage} limit={plan.maxMembers} />
          <UsageMeter label="Documents" used={usage.documents} limit={plan.maxDocuments} />
          <UsageMeter
            label="Storage"
            used={usage.storageBytes}
            limit={plan.maxStorageBytes}
            format={formatBytes}
          />
        </CardContent>
      </Card>

      <section aria-label="Plans" className="grid gap-4 sm:grid-cols-3">
        {plans.map((option) => {
          const current = option.id === plan.id;
          return (
            <Card key={option.id} className={cn(current && 'ring-primary ring-2')}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2">
                  {option.name}
                  {current && <Badge>Current</Badge>}
                </CardTitle>
                <CardDescription>{formatPrice(option.priceMinor)}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <ul className="grid gap-1.5 text-sm">
                  {planFeatures(option).map((feature) => (
                    <li key={feature} className="flex items-center gap-2">
                      <Check className="text-muted-foreground size-4" />
                      {feature}
                    </li>
                  ))}
                </ul>
                {manager && !current && option.priceMinor > 0 && (
                  <UpgradeButton
                    workspaceId={workspaceId}
                    planId={option.id}
                    planName={option.name}
                  />
                )}
              </CardContent>
            </Card>
          );
        })}
      </section>
      {!manager && (
        <p className="text-muted-foreground text-sm">Only owners and admins can change the plan.</p>
      )}
    </>
  );
}

export function WorkspaceBillingPage(props: WorkspaceBillingPageProps) {
  return (
    <main className="mx-auto grid w-full max-w-4xl content-start gap-6 px-6 py-14">
      <h1 className="text-3xl font-semibold tracking-tight">Billing</h1>
      <Suspense
        fallback={
          <div className="grid gap-6">
            <Skeleton className="h-48" />
            <Skeleton className="h-64" />
          </div>
        }
      >
        <Billing {...props} />
      </Suspense>
    </main>
  );
}
