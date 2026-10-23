import { Module } from '@nestjs/common';
import { WorkspaceAccessService } from './workspace-access.service.js';

@Module({
  providers: [WorkspaceAccessService],
  exports: [WorkspaceAccessService],
})
export class PermissionsModule {}
