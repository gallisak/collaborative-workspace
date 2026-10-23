import { Module } from '@nestjs/common';
import { PermissionsModule } from '../permissions/permissions.module.js';
import { BillingController } from './billing.controller.js';
import { BillingRepository } from './billing.repository.js';
import { BillingService } from './billing.service.js';
import { BillingWebhookService } from './billing-webhook.service.js';
import { MockPaymentProvider } from './mock-payment-provider.service.js';

@Module({
  imports: [PermissionsModule],
  controllers: [BillingController],
  providers: [BillingService, BillingRepository, BillingWebhookService, MockPaymentProvider],
})
export class BillingModule {}
