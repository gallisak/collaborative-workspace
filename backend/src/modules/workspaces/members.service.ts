import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { UnitOfWork } from '../../infra/prisma/unit-of-work.js';
import { WorkspaceAccessService } from '../permissions/workspace-access.service.js';
import { canChangeRole, canRemoveMember } from '../permissions/workspace-roles.js';
import type { AssignableRole, MemberDto } from './workspaces.dto.js';
import { WorkspacesRepository } from './workspaces.repository.js';

@Injectable()
export class MembersService {
  private readonly logger = new Logger(MembersService.name);

  constructor(
    private readonly workspaces: WorkspacesRepository,
    private readonly access: WorkspaceAccessService,
    private readonly uow: UnitOfWork,
  ) {}

  async list(userId: string, workspaceId: string): Promise<MemberDto[]> {
    await this.access.requireMember(workspaceId, userId);
    const members = await this.workspaces.listMembers(workspaceId);
    return members.map((member) => ({
      userId: member.userId,
      email: member.user.email,
      name: member.user.name,
      role: member.role,
      joinedAt: member.createdAt,
    }));
  }

  async changeRole(
    actorId: string,
    workspaceId: string,
    targetUserId: string,
    role: AssignableRole,
  ) {
    await this.uow.run(async (tx) => {
      const actorRole = await this.access.requireMember(workspaceId, actorId, tx);
      const target = await this.workspaces.findMember(workspaceId, targetUserId, tx);
      if (!target) {
        throw new NotFoundException('Member not found');
      }
      if (!canChangeRole(actorRole, target.role, role)) {
        throw new ForbiddenException('You cannot change the role of this member');
      }
      await this.workspaces.updateRole(workspaceId, targetUserId, role, tx);
    });
    this.logger.log({ workspaceId, actorId, targetUserId, role }, 'Member role changed');
  }

  async remove(actorId: string, workspaceId: string, targetUserId: string) {
    await this.uow.run(async (tx) => {
      const actorRole = await this.access.requireMember(workspaceId, actorId, tx);
      const target = await this.workspaces.findMember(workspaceId, targetUserId, tx);
      if (!target) {
        throw new NotFoundException('Member not found');
      }
      if (!canRemoveMember({ userId: actorId, role: actorRole }, target)) {
        throw new ForbiddenException(
          target.role === 'OWNER'
            ? 'The owner cannot leave or be removed'
            : 'You cannot remove this member',
        );
      }
      await this.workspaces.removeMember(workspaceId, targetUserId, tx);
    });
    this.logger.log({ workspaceId, actorId, targetUserId }, 'Member removed');
  }
}
