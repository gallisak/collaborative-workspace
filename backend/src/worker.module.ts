import { Module } from '@nestjs/common';
import { CoreModule } from './infra/core.module.js';
import { BillingWorkerModule } from './modules/billing/billing-worker.module.js';
import { NotificationsWorkerModule } from './modules/notifications/notifications-worker.module.js';
import { PublishingWorkerModule } from './modules/publishing/publishing-worker.module.js';
import { SearchWorkerModule } from './modules/search/search-worker.module.js';

@Module({
  imports: [
    CoreModule,
    NotificationsWorkerModule,
    PublishingWorkerModule,
    SearchWorkerModule,
    BillingWorkerModule,
  ],
})
export class WorkerModule {}
