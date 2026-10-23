import { InjectQueue } from '@nestjs/bullmq';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Env } from '../../infra/config/env.schema.js';
import {
  BILLING_QUEUE,
  BillingJob,
  type ProcessBillingEventJob,
} from '../../infra/queue/billing-jobs.js';
import { billingEventSchema } from './billing-event.js';
import { BillingRepository } from './billing.repository.js';
import { verifySignature } from './webhook-signature.js';

@Injectable()
export class BillingWebhookService {
  private readonly logger = new Logger(BillingWebhookService.name);
  private readonly secret: string;

  constructor(
    private readonly billing: BillingRepository,
    @InjectQueue(BILLING_QUEUE) private readonly queue: Queue,
    config: ConfigService<Env, true>,
  ) {
    this.secret = config.get('BILLING_WEBHOOK_SECRET', { infer: true });
  }

  async receive(rawBody: Buffer | undefined, signature: string | undefined) {
    const payload = rawBody?.toString('utf8') ?? '';
    if (!verifySignature(this.secret, payload, signature, Math.floor(Date.now() / 1000))) {
      this.logger.warn('Rejected a billing webhook with an invalid signature');
      throw new BadRequestException('Invalid signature');
    }
    const { event, json } = this.parse(payload);
    const { duplicate, processedAt } = await this.billing.recordEvent({
      id: event.id,
      type: event.type,
      payload: json,
      occurredAt: new Date(event.created * 1000),
    });
    if (duplicate) {
      this.logger.warn(
        { eventId: event.id, type: event.type, processed: processedAt !== null },
        'Duplicate billing webhook delivery',
      );
    } else {
      this.logger.log({ eventId: event.id, type: event.type }, 'Billing webhook received');
    }
    if (!processedAt) {
      const job: ProcessBillingEventJob = { eventId: event.id };
      await this.queue.add(BillingJob.ProcessEvent, job, { deduplication: { id: event.id } });
    }
  }

  private parse(payload: string) {
    try {
      const json = JSON.parse(payload) as Prisma.InputJsonObject;
      return { event: billingEventSchema.parse(json), json };
    } catch {
      throw new BadRequestException('Malformed billing event');
    }
  }
}
