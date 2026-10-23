import { Module } from '@nestjs/common';
import { PermissionsModule } from '../permissions/permissions.module.js';
import { UsersModule } from '../users/users.module.js';
import { InvitationsController, WorkspacesController } from './workspaces.controller.js';
import { InvitationsRepository } from './invitations.repository.js';
import { InvitationsService } from './invitations.service.js';
import { MembersService } from './members.service.js';
import { WorkspacesRepository } from './workspaces.repository.js';
import { WorkspacesService } from './workspaces.service.js';

@Module({
  imports: [PermissionsModule, UsersModule],
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
