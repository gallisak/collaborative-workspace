import { Module } from '@nestjs/common';
import { AttachmentsPurgeModule } from '../attachments/attachments-purge.module.js';
import { PermissionsModule } from '../permissions/permissions.module.js';
import { PageRevalidationModule } from '../publishing/page-revalidation.module.js';
import { UsersModule } from '../users/users.module.js';
import { InvitationsController, WorkspacesController } from './workspaces.controller.js';
import { InvitationsRepository } from './invitations.repository.js';
import { InvitationsService } from './invitations.service.js';
import { MembersService } from './members.service.js';
import { WorkspacesRepository } from './workspaces.repository.js';
import { WorkspacesService } from './workspaces.service.js';

@Module({
  imports: [PermissionsModule, UsersModule, PageRevalidationModule, AttachmentsPurgeModule],
  controllers: [WorkspacesController, InvitationsController],
  providers: [
    WorkspacesService,
    MembersService,
    InvitationsService,
    WorkspacesRepository,
    InvitationsRepository,
  ],
  exports: [WorkspacesRepository],
})
export class WorkspacesModule {}
