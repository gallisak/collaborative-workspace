import { Module } from '@nestjs/common';
import { PermissionsModule } from '../permissions/permissions.module.js';
import { UsersModule } from '../users/users.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { DocumentsController, WorkspaceDocumentsController } from './documents.controller.js';
import { DocumentsRepository } from './documents.repository.js';
import { DocumentsService } from './documents.service.js';
import { TreeCacheService } from './tree-cache.service.js';

@Module({
  imports: [PermissionsModule, UsersModule, WorkspacesModule],
  controllers: [WorkspaceDocumentsController, DocumentsController],
  providers: [DocumentsService, DocumentsRepository, TreeCacheService],
})
export class DocumentsModule {}
