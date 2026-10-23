import { z } from 'zod';
import type { CheckoutSessionStatus, PlanTier } from '../../generated/prisma/enums.js';

export const CHECKOUT_COMPLETED = 'checkout.session.completed';

export const billingEventSchema = z.object({
  id: z.string().regex(/^evt_\w{8,64}$/),
  type: z.string().min(1).max(100),
  created: z.number().int().positive(),
  data: z.object({ object: z.record(z.string(), z.unknown()) }),
});

export const checkoutCompletedSchema = z.object({
  id: z.uuid(),
  workspaceId: z.uuid(),
  planId: z.enum(['PRO', 'TEAM']),
  subscriptionId: z.string().regex(/^sub_\w{8,64}$/),
  currentPeriodEnd: z.iso.datetime(),
});

export type BillingEventPayload = z.infer<typeof billingEventSchema>;
export type CheckoutCompleted = z.infer<typeof checkoutCompletedSchema>;

export type CheckoutDecision =
  | { kind: 'already-processed' }
  | { kind: 'ignore'; reason: string }
  | {
      kind: 'activate';
      workspaceId: string;
      planId: PlanTier;
      subscriptionId: string;
      periodEnd: Date;
    };

export function decideCheckoutCompleted(
  event: { processedAt: Date | null },
  session: { status: CheckoutSessionStatus; workspaceId: string; planId: PlanTier } | null,
  payload: CheckoutCompleted,
): CheckoutDecision {
  if (event.processedAt) {
    return { kind: 'already-processed' };
  }
  if (!session) {
    return { kind: 'ignore', reason: 'Unknown checkout session' };
  }
  if (session.workspaceId !== payload.workspaceId || session.planId !== payload.planId) {
    return { kind: 'ignore', reason: 'Event does not match the checkout session' };
  }
  if (session.status !== 'OPEN') {
    return {
      kind: 'ignore',
      reason: `Checkout session is already ${session.status.toLowerCase()}`,
    };
  }
  return {
    kind: 'activate',
    workspaceId: payload.workspaceId,
    planId: payload.planId,
    subscriptionId: payload.subscriptionId,
    periodEnd: new Date(payload.currentPeriodEnd),
  };
}
