import { Module } from '@nestjs/common';
import { DocumentAccessService } from './document-access.service.js';
import { WorkspaceAccessService } from './workspace-access.service.js';

@Module({
  providers: [WorkspaceAccessService, DocumentAccessService],
  exports: [WorkspaceAccessService, DocumentAccessService],
})
export class PermissionsModule {}
