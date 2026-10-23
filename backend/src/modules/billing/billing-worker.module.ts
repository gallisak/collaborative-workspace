import { Module } from '@nestjs/common';
import { BillingEventsProcessor } from './billing-events.processor.js';
import { BillingRepository } from './billing.repository.js';

@Module({
  providers: [BillingEventsProcessor, BillingRepository],
})
export class BillingWorkerModule {}
