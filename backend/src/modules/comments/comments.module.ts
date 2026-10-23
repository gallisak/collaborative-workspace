import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PermissionsModule } from '../permissions/permissions.module.js';
import { CommentsController, DocumentThreadsController } from './comments.controller.js';
import { CommentsRepository } from './comments.repository.js';
import { CommentsService } from './comments.service.js';

@Module({
  imports: [PermissionsModule, NotificationsModule],
  controllers: [DocumentThreadsController, CommentsController],
  providers: [CommentsService, CommentsRepository],
})
export class CommentsModule {}
