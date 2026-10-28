import { Injectable } from '@nestjs/common';
import type { WorkspaceRole } from '../../generated/prisma/enums.js';
import { PrismaRepository, type Transaction } from '../../infra/prisma/unit-of-work.js';
import { activeShareLinkWhere } from '../permissions/document-access.js';
import { pendingInvitationWhere } from './invitations.repository.js';
import { guestEditorsWhere } from './plan-limits.js';

@Injectable()
export class WorkspacesRepository extends PrismaRepository {
  async lockWithPlan(workspaceId: string, tx: Transaction) {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM workspaces WHERE id = ${workspaceId}::uuid FOR UPDATE`;
    return rows.length === 1 ? this.findWithPlan(workspaceId, tx) : null;
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

  async publishedDocumentIds(workspaceId: string, now: Date, tx: Transaction) {
    const links = await tx.shareLink.findMany({
      where: {
        document: { workspaceId, deletedAt: null },
        ...activeShareLinkWhere(now),
      },
      distinct: ['documentId'],
      select: { documentId: true },
    });
    return links.map((link) => link.documentId);
  }

  delete(workspaceId: string, tx: Transaction) {
    return tx.workspace.delete({ where: { id: workspaceId } });
  }

  countMembers(workspaceId: string, tx: Transaction) {
    return tx.workspaceMember.count({ where: { workspaceId } });
  }

  async countSeats(
    workspaceId: string,
    now: Date,
    tx: Transaction,
    except: { userId?: string; email?: string } = {},
  ) {
    const members = await this.countMembers(workspaceId, tx);
    const guestEditors = await tx.user.count({
      where: {
        ...guestEditorsWhere(workspaceId),
        NOT: [
          ...(except.userId ? [{ id: except.userId }] : []),
          ...(except.email ? [{ email: except.email }] : []),
        ],
      },
    });
    const invitations = await tx.invitation.count({
      where: {
        workspaceId,
        ...pendingInvitationWhere(now),
        ...(except.email && { email: { not: except.email } }),
      },
    });
    return members + guestEditors + invitations;
  }

  holdsSeat(workspaceId: string, userId: string, tx: Transaction) {
    return tx.user
      .count({
        where: {
          id: userId,
          OR: [{ memberships: { some: { workspaceId } } }, guestEditorsWhere(workspaceId)],
        },
      })
      .then((count) => count > 0);
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

  async removeMember(workspaceId: string, userId: string, tx: Transaction) {
    await tx.documentPermission.deleteMany({ where: { userId, document: { workspaceId } } });
    await tx.notification.deleteMany({ where: { userId, document: { is: { workspaceId } } } });
    await tx.workspaceMember.delete({ where: { workspaceId_userId: { workspaceId, userId } } });
  }
}
