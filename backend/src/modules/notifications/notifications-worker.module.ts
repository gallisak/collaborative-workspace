import { Module } from '@nestjs/common';
import { PermissionsModule } from '../permissions/permissions.module.js';
import { MentionsProcessor } from './mentions.processor.js';
import { NotificationsRepository } from './notifications.repository.js';

@Module({
  imports: [PermissionsModule],
  providers: [MentionsProcessor, NotificationsRepository],
})
export class NotificationsWorkerModule {}
