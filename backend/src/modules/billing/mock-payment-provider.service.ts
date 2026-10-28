import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';
import { randomBytes } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { API_PREFIX } from '../../common/api-prefix.js';
import { durationToSeconds } from '../../common/duration.js';
import type { Env } from '../../infra/config/env.schema.js';
import {
  type BillingEventPayload,
  CHECKOUT_COMPLETED,
  type CheckoutCompleted,
} from './billing-event.js';
import { BillingRepository } from './billing.repository.js';
import { BillingService, isCheckoutOpen } from './billing.service.js';
import { SIGNATURE_HEADER, signPayload } from './webhook-signature.js';

const providerId = (prefix: string) => `${prefix}_${randomBytes(12).toString('hex')}`;
const DELIVERY_TIMEOUT_MS = 5000;

@Injectable()
export class MockPaymentProvider {
  private readonly logger = new Logger(MockPaymentProvider.name);
  private readonly secret: string;
  private readonly periodMs: number;

  constructor(
    private readonly billing: BillingRepository,
    private readonly checkouts: BillingService,
    private readonly adapterHost: HttpAdapterHost,
    config: ConfigService<Env, true>,
  ) {
    this.secret = config.get('BILLING_WEBHOOK_SECRET', { infer: true });
    this.periodMs = durationToSeconds(config.get('SUBSCRIPTION_PERIOD', { infer: true })) * 1000;
  }

  async pay(userId: string, sessionId: string) {
    const session = await this.checkouts.findCheckout(userId, sessionId);
    if (session.status === 'COMPLETED') {
      throw new ConflictException('This checkout session is already paid');
    }
    if (session.status === 'FAILED') {
      throw new ConflictException(session.failureReason ?? 'This checkout session has failed');
    }
    if (!isCheckoutOpen(session, new Date())) {
      await this.billing.expireCheckout(sessionId);
      throw new BadRequestException('This checkout session has expired');
    }
    const object: CheckoutCompleted = {
      id: session.id,
      workspaceId: session.workspaceId,
      planId: session.planId as CheckoutCompleted['planId'],
      subscriptionId:
        (await this.billing.findSubscriptionId(session.workspaceId)) ?? providerId('sub'),
      currentPeriodEnd: new Date(Date.now() + this.periodMs).toISOString(),
    };
    const event: BillingEventPayload = {
      id: providerId('evt'),
      type: CHECKOUT_COMPLETED,
      created: Math.floor(Date.now() / 1000),
      data: { object },
    };
    const payload = JSON.stringify(event);
    const signature = signPayload(this.secret, payload, event.created);
    this.logger.log({ checkoutSessionId: sessionId, eventId: event.id }, 'Mock payment succeeded');
    await this.deliver(payload, signature);
  }

  private async deliver(payload: string, signature: string) {
    const server = this.adapterHost.httpAdapter.getHttpServer() as Server;
    const { port } = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${port}/${API_PREFIX}/billing/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [SIGNATURE_HEADER]: signature },
      body: payload,
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    }).catch((error: unknown) => {
      this.logger.error({ err: error }, 'Mock webhook delivery failed');
      return null;
    });
    if (!response?.ok) {
      this.logger.error({ status: response?.status }, 'Mock webhook was not accepted');
      throw new ServiceUnavailableException('The payment provider could not deliver the webhook');
    }
  }
}
