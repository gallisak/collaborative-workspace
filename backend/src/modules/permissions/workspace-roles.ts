import type { WorkspaceRole } from '../../generated/prisma/enums.js';

const RANK: Record<WorkspaceRole, number> = { VIEWER: 0, EDITOR: 1, ADMIN: 2, OWNER: 3 };

export function hasRoleAtLeast(role: WorkspaceRole, minimum: WorkspaceRole): boolean {
  return RANK[role] >= RANK[minimum];
}

export function canManageMembers(role: WorkspaceRole): boolean {
  return hasRoleAtLeast(role, 'ADMIN');
}

export function canAssignRole(actor: WorkspaceRole, target: WorkspaceRole): boolean {
  return target !== 'OWNER' && canManageMembers(actor) && RANK[actor] > RANK[target];
}

export function canChangeRole(
  actor: WorkspaceRole,
  current: WorkspaceRole,
  next: WorkspaceRole,
): boolean {
  return canAssignRole(actor, next) && RANK[actor] > RANK[current];
}

export function canRemoveMember(
  actor: { userId: string; role: WorkspaceRole },
  member: { userId: string; role: WorkspaceRole },
): boolean {
  if (actor.userId === member.userId) {
    return member.role !== 'OWNER';
  }
  return canManageMembers(actor.role) && RANK[actor.role] > RANK[member.role];
}
