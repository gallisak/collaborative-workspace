import { PlanLimitExceededException } from '../../common/errors/plan-limit.exception.js';
import type { Prisma } from '../../generated/prisma/client.js';

export interface PlanLimit {
  planName: string;
  resource: string;
  limit: number | null;
}

export function assertCapacity({ planName, resource, limit }: PlanLimit, used: number) {
  if (limit !== null && used >= limit) {
    throw new PlanLimitExceededException(resource, planName, limit);
  }
}

export function seatLimit(plan: { name: string; maxMembers: number | null }): PlanLimit {
  return {
    planName: plan.name,
    resource: 'members, guest editors included',
    limit: plan.maxMembers,
  };
}

export const guestEditorsWhere = (workspaceId: string): Prisma.UserWhereInput => ({
  memberships: { none: { workspaceId } },
  documentPermissions: {
    some: { accessLevel: 'EDIT', document: { workspaceId, deletedAt: null } },
  },
});
