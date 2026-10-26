import type { WorkspaceRole } from '@/shared/api';

const RANK: Record<WorkspaceRole, number> = { VIEWER: 0, EDITOR: 1, ADMIN: 2, OWNER: 3 };

export const ROLE_LABELS: Record<WorkspaceRole, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  EDITOR: 'Editor',
  VIEWER: 'Viewer',
};

export const ASSIGNABLE_ROLES = ['ADMIN', 'EDITOR', 'VIEWER'] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export const hasRoleAtLeast = (role: WorkspaceRole, minimum: WorkspaceRole) =>
  RANK[role] >= RANK[minimum];

export const canEditContent = (role: WorkspaceRole) => hasRoleAtLeast(role, 'EDITOR');
export const canManageMembers = (role: WorkspaceRole) => hasRoleAtLeast(role, 'ADMIN');
export const canManageBilling = (role: WorkspaceRole) => hasRoleAtLeast(role, 'ADMIN');

export const canAssignRole = (actor: WorkspaceRole, target: WorkspaceRole) =>
  target !== 'OWNER' && canManageMembers(actor) && RANK[actor] > RANK[target];

export const assignableRoles = (actor: WorkspaceRole) =>
  ASSIGNABLE_ROLES.filter((role) => canAssignRole(actor, role));
