import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { WorkspaceRole } from '../../generated/prisma/enums.js';
import { PrismaRepository, type Transaction } from '../../infra/prisma/unit-of-work.js';
import { hasRoleAtLeast } from './workspace-roles.js';

@Injectable()
export class WorkspaceAccessService extends PrismaRepository {
  async roleOf(workspaceId: string, userId: string, tx?: Transaction) {
    const member = await this.db(tx).workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { role: true },
    });
    return member?.role ?? null;
  }

  async requireMember(workspaceId: string, userId: string, tx?: Transaction) {
    const role = await this.roleOf(workspaceId, userId, tx);
    if (!role) {
      throw new NotFoundException('Workspace not found');
    }
    return role;
  }

  async requireRole(workspaceId: string, userId: string, minimum: WorkspaceRole, tx?: Transaction) {
    const role = await this.requireMember(workspaceId, userId, tx);
    if (!hasRoleAtLeast(role, minimum)) {
      throw new ForbiddenException(`Requires ${minimum.toLowerCase()} role in this workspace`);
    }
    return role;
  }
}
