import { Module } from '@nestjs/common';
import { AttachmentsPurgeModule } from '../attachments/attachments-purge.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PermissionsModule } from '../permissions/permissions.module.js';
import { PageRevalidationModule } from '../publishing/page-revalidation.module.js';
import { SearchIndexingModule } from '../search/search-indexing.module.js';
import { UsersModule } from '../users/users.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import {
  DocumentsController,
  SharedDocumentsController,
  WorkspaceDocumentsController,
} from './documents.controller.js';
import { DocumentsRepository } from './documents.repository.js';
import { DocumentsService } from './documents.service.js';
import { TreeCacheService } from './tree-cache.service.js';

@Module({
  imports: [
    PermissionsModule,
    UsersModule,
    WorkspacesModule,
    PageRevalidationModule,
    SearchIndexingModule,
    NotificationsModule,
    AttachmentsPurgeModule,
  ],
  controllers: [WorkspaceDocumentsController, SharedDocumentsController, DocumentsController],
  providers: [DocumentsService, DocumentsRepository, TreeCacheService],
})
export class DocumentsModule {}
