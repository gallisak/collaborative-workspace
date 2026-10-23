import { Module } from '@nestjs/common';
import { CoreModule } from './infra/core.module.js';
import { NotificationsWorkerModule } from './modules/notifications/notifications-worker.module.js';

@Module({
  imports: [CoreModule, NotificationsWorkerModule],
})
export class WorkerModule {}
