import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { BILLING_QUEUE, type ProcessBillingEventJob } from '../../infra/queue/billing-jobs.js';
import { UnitOfWork } from '../../infra/prisma/unit-of-work.js';
import {
  CHECKOUT_COMPLETED,
  checkoutCompletedSchema,
  decideCheckoutCompleted,
} from './billing-event.js';
import { BillingRepository } from './billing.repository.js';

@Processor(BILLING_QUEUE)
export class BillingEventsProcessor extends WorkerHost {
  private readonly logger = new Logger(BillingEventsProcessor.name);

  constructor(
    private readonly billing: BillingRepository,
    private readonly uow: UnitOfWork,
  ) {
    super();
  }

  async process({ data: { eventId } }: Job<ProcessBillingEventJob>) {
    await this.uow.run(async (tx) => {
      const event = await this.billing.lockEvent(eventId, tx);
      if (!event) {
        this.logger.warn({ eventId }, 'Billing event to process does not exist');
        return;
      }
      if (event.type !== CHECKOUT_COMPLETED) {
        if (!event.processedAt) {
          await this.billing.markProcessed(eventId, tx);
          this.logger.log({ eventId, type: event.type }, 'Ignored billing event type');
        }
        return;
      }
      const parsed = checkoutCompletedSchema.safeParse(
        (event.payload as { data?: { object?: unknown } }).data?.object,
      );
      if (!parsed.success) {
        await this.billing.markProcessed(eventId, tx);
        this.logger.warn({ eventId }, 'Ignored malformed checkout event');
        return;
      }
      const session = await this.billing.lockCheckout(parsed.data.id, tx);
      const decision = decideCheckoutCompleted(event, session, parsed.data);
      if (decision.kind === 'already-processed') {
        this.logger.warn({ eventId }, 'Billing event already processed, skipping');
        return;
      }
      if (decision.kind === 'ignore') {
        await this.billing.markProcessed(eventId, tx);
        this.logger.warn({ eventId, reason: decision.reason }, 'Ignored checkout event');
        return;
      }
      const previousPlan = await this.billing.lockWorkspacePlan(decision.workspaceId, tx);
      if (!previousPlan) {
        await this.billing.markProcessed(eventId, tx);
        this.logger.warn({ eventId }, 'Workspace of the checkout no longer exists');
        return;
      }
      await this.billing.activate(parsed.data.id, decision, tx);
      await this.billing.markProcessed(eventId, tx);
      this.logger.log(
        { eventId, workspaceId: decision.workspaceId, from: previousPlan, to: decision.planId },
        'Workspace plan changed',
      );
    });
  }
}
