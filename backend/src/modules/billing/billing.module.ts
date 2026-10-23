import { Module } from '@nestjs/common';
import { AttachmentsModule } from '../attachments/attachments.module.js';
import { PermissionsModule } from '../permissions/permissions.module.js';
import { BillingController } from './billing.controller.js';
import { BillingRepository } from './billing.repository.js';
import { BillingService } from './billing.service.js';
import { BillingWebhookService } from './billing-webhook.service.js';
import { MockPaymentProvider } from './mock-payment-provider.service.js';

@Module({
  imports: [PermissionsModule, AttachmentsModule],
  controllers: [BillingController],
  providers: [BillingService, BillingRepository, BillingWebhookService, MockPaymentProvider],
})
export class BillingModule {}
