import { Module } from '@nestjs/common';
import { CoreModule } from './infra/core.module.js';
import { HealthModule } from './infra/health/health.module.js';
import { MetricsModule } from './infra/metrics/metrics.module.js';
import { QueueMetrics } from './infra/queue/queue-metrics.js';
import { AttachmentsWorkerModule } from './modules/attachments/attachments-worker.module.js';
import { BillingWorkerModule } from './modules/billing/billing-worker.module.js';
import { NotificationsWorkerModule } from './modules/notifications/notifications-worker.module.js';
import { PublishingWorkerModule } from './modules/publishing/publishing-worker.module.js';
import { SearchWorkerModule } from './modules/search/search-worker.module.js';

@Module({
  imports: [
    CoreModule,
    MetricsModule.forService('worker'),
    HealthModule,
    NotificationsWorkerModule,
    PublishingWorkerModule,
    SearchWorkerModule,
    BillingWorkerModule,
    AttachmentsWorkerModule,
  ],
  providers: [QueueMetrics],
})
export class WorkerModule {}
