import { Injectable } from '@nestjs/common';
import type { WorkspaceRole } from '../../generated/prisma/enums.js';
import { PrismaRepository, type Transaction } from '../../infra/prisma/unit-of-work.js';

@Injectable()
export class WorkspacesRepository extends PrismaRepository {
  async lock(workspaceId: string, tx: Transaction): Promise<boolean> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM workspaces WHERE id = ${workspaceId}::uuid FOR UPDATE`;
    return rows.length === 1;
  }

  createWithOwner(name: string, ownerId: string, tx: Transaction) {
    return tx.workspace.create({
      data: { name, members: { create: { userId: ownerId, role: 'OWNER' } } },
    });
  }

  findMemberships(userId: string) {
    return this.prisma.workspaceMember.findMany({
      where: { userId },
      include: { workspace: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  findWithPlan(workspaceId: string, tx?: Transaction) {
    return this.db(tx).workspace.findUnique({
      where: { id: workspaceId },
      include: { plan: true, _count: { select: { members: true } } },
    });
  }

  rename(workspaceId: string, name: string) {
    return this.prisma.workspace.update({ where: { id: workspaceId }, data: { name } });
  }

  delete(workspaceId: string) {
    return this.prisma.workspace.delete({ where: { id: workspaceId } });
  }

  countMembers(workspaceId: string, tx: Transaction) {
    return tx.workspaceMember.count({ where: { workspaceId } });
  }

  listMembers(workspaceId: string) {
    return this.prisma.workspaceMember.findMany({
      where: { workspaceId },
      include: { user: { select: { email: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  findMember(workspaceId: string, userId: string, tx: Transaction) {
    return tx.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
  }

  isMemberByEmail(workspaceId: string, email: string, tx: Transaction) {
    return tx.workspaceMember
      .count({ where: { workspaceId, user: { email } } })
      .then((count) => count > 0);
  }

  addMember(workspaceId: string, userId: string, role: WorkspaceRole, tx: Transaction) {
    return tx.workspaceMember.create({ data: { workspaceId, userId, role } });
  }

  updateRole(workspaceId: string, userId: string, role: WorkspaceRole, tx: Transaction) {
    return tx.workspaceMember.update({
      where: { workspaceId_userId: { workspaceId, userId } },
      data: { role },
    });
  }

  removeMember(workspaceId: string, userId: string, tx: Transaction) {
    return tx.workspaceMember.delete({ where: { workspaceId_userId: { workspaceId, userId } } });
  }
}
