import { Injectable } from '@nestjs/common';
import type { WorkspaceRole } from '../../generated/prisma/enums.js';
import { PrismaRepository, type Transaction } from '../../infra/prisma/unit-of-work.js';

const pending = (now: Date) => ({ acceptedAt: null, revokedAt: null, expiresAt: { gt: now } });

@Injectable()
export class InvitationsRepository extends PrismaRepository {
  countPending(workspaceId: string, now: Date, tx: Transaction) {
    return tx.invitation.count({ where: { workspaceId, ...pending(now) } });
  }

  listPending(workspaceId: string, now: Date) {
    return this.prisma.invitation.findMany({
      where: { workspaceId, ...pending(now) },
      orderBy: { createdAt: 'desc' },
    });
  }

  revokeOpenForEmail(workspaceId: string, email: string, now: Date, tx: Transaction) {
    return tx.invitation.updateMany({
      where: { workspaceId, email, acceptedAt: null, revokedAt: null },
      data: { revokedAt: now },
    });
  }

  create(
    data: {
      workspaceId: string;
      email: string;
      role: WorkspaceRole;
      tokenHash: string;
      invitedById: string;
      expiresAt: Date;
    },
    tx: Transaction,
  ) {
    return tx.invitation.create({ data });
  }

  async revoke(workspaceId: string, invitationId: string, now: Date) {
    const { count } = await this.prisma.invitation.updateMany({
      where: { id: invitationId, workspaceId, acceptedAt: null, revokedAt: null },
      data: { revokedAt: now },
    });
    return count === 1;
  }

  findByTokenHash(tokenHash: string) {
    return this.prisma.invitation.findUnique({ where: { tokenHash } });
  }

  async markAccepted(invitationId: string, now: Date, tx: Transaction) {
    const { count } = await tx.invitation.updateMany({
      where: { id: invitationId, ...pending(now) },
      data: { acceptedAt: now },
    });
    return count === 1;
  }
}
