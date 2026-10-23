import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import type { PlanTier } from '../../generated/prisma/enums.js';
import { PrismaRepository, type Transaction } from '../../infra/prisma/unit-of-work.js';

export interface NewBillingEvent {
  id: string;
  type: string;
  payload: Prisma.InputJsonValue;
  occurredAt: Date;
}

export interface Activation {
  workspaceId: string;
  planId: PlanTier;
  subscriptionId: string;
  periodEnd: Date;
}

@Injectable()
export class BillingRepository extends PrismaRepository {
  listPlans() {
    return this.prisma.plan.findMany({ orderBy: { priceMinor: 'asc' } });
  }

  findPlan(planId: PlanTier) {
    return this.prisma.plan.findUniqueOrThrow({ where: { id: planId } });
  }

  findWorkspace(workspaceId: string) {
    return this.prisma.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      include: {
        plan: true,
        subscription: { select: { status: true, currentPeriodEnd: true } },
        _count: { select: { members: true, documents: { where: { deletedAt: null } } } },
      },
    });
  }

  findSubscriptionId(workspaceId: string) {
    return this.prisma.subscription
      .findUnique({ where: { workspaceId }, select: { providerSubscriptionId: true } })
      .then((subscription) => subscription?.providerSubscriptionId ?? null);
  }

  createCheckout(data: {
    workspaceId: string;
    planId: PlanTier;
    createdById: string;
    expiresAt: Date;
  }) {
    return this.prisma.checkoutSession.create({ data, include: { plan: true } });
  }

  findCheckout(sessionId: string) {
    return this.prisma.checkoutSession.findUnique({
      where: { id: sessionId },
      include: { plan: true },
    });
  }

  expireCheckout(sessionId: string) {
    return this.prisma.checkoutSession.updateMany({
      where: { id: sessionId, status: 'OPEN' },
      data: { status: 'EXPIRED' },
    });
  }

  async recordEvent(event: NewBillingEvent) {
    const inserted = await this.prisma.billingEvent.createMany({
      data: [event],
      skipDuplicates: true,
    });
    const stored = await this.prisma.billingEvent.findUniqueOrThrow({
      where: { id: event.id },
      select: { processedAt: true },
    });
    return { duplicate: inserted.count === 0, processedAt: stored.processedAt };
  }

  async lockEvent(eventId: string, tx: Transaction) {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM billing_events WHERE id = ${eventId} FOR UPDATE`;
    return rows.length === 1 ? tx.billingEvent.findUniqueOrThrow({ where: { id: eventId } }) : null;
  }

  async lockCheckout(sessionId: string, tx: Transaction) {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM checkout_sessions WHERE id = ${sessionId}::uuid FOR UPDATE`;
    return rows.length === 1
      ? tx.checkoutSession.findUniqueOrThrow({ where: { id: sessionId } })
      : null;
  }

  async lockWorkspacePlan(workspaceId: string, tx: Transaction) {
    const rows = await tx.$queryRaw<{ plan_id: PlanTier }[]>`
      SELECT plan_id FROM workspaces WHERE id = ${workspaceId}::uuid FOR UPDATE`;
    return rows[0]?.plan_id ?? null;
  }

  async activate(sessionId: string, activation: Activation, tx: Transaction) {
    const { workspaceId, planId, subscriptionId, periodEnd } = activation;
    await tx.workspace.update({ where: { id: workspaceId }, data: { planId } });
    await tx.subscription.upsert({
      where: { workspaceId },
      create: {
        workspaceId,
        planId,
        status: 'ACTIVE',
        providerSubscriptionId: subscriptionId,
        currentPeriodEnd: periodEnd,
      },
      update: {
        planId,
        status: 'ACTIVE',
        providerSubscriptionId: subscriptionId,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
      },
    });
    await tx.checkoutSession.update({
      where: { id: sessionId },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
  }

  markProcessed(eventId: string, tx: Transaction) {
    return tx.billingEvent.update({ where: { id: eventId }, data: { processedAt: new Date() } });
  }
}
