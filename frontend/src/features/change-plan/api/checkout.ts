'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { routes } from '@/shared/config';
import { mutate } from '@/shared/dal';
import { idSchema } from '@/shared/lib';

const PAID_PLANS = ['PRO', 'TEAM'] as const;

export async function startCheckout(workspaceId: string, planId: string) {
  const parsed = z
    .object({ workspaceId: idSchema, planId: z.enum(PAID_PLANS) })
    .parse({ workspaceId, planId });
  const result = await mutate((api) =>
    api.POST('/api/workspaces/{workspaceId}/billing/checkout', {
      params: { path: { workspaceId: parsed.workspaceId } },
      body: { planId: parsed.planId },
    }),
  );
  if (!result.ok) {
    return { error: result.error };
  }
  redirect(routes.checkout(result.data.id));
}

export async function payCheckout(sessionId: string) {
  const id = idSchema.parse(sessionId);
  const result = await mutate((api) =>
    api.POST('/api/billing/checkout-sessions/{sessionId}/pay', {
      params: { path: { sessionId: id } },
    }),
  );
  return result.ok ? {} : { error: result.error };
}
