import type { Prisma } from '../../generated/prisma/client.js';
import type { AccessLevel, WorkspaceRole } from '../../generated/prisma/enums.js';

export type DocumentAccess = 'NONE' | 'VIEW' | 'EDIT' | 'MANAGE';

const ORDER: readonly DocumentAccess[] = ['NONE', 'VIEW', 'EDIT', 'MANAGE'];

export const hasAccess = (access: DocumentAccess, required: DocumentAccess) =>
  ORDER.indexOf(access) >= ORDER.indexOf(required);

const strongest = (a: DocumentAccess, b: DocumentAccess) => (hasAccess(a, b) ? a : b);

export interface DocumentAccessInput {
  workspaceRole: WorkspaceRole | null;
  grantChain: readonly (AccessLevel | null)[];
  shareLinkLevel: AccessLevel | null;
  authenticated: boolean;
}

export function nearestGrant(grantChain: readonly (AccessLevel | null)[]): AccessLevel | null {
  return grantChain.find((grant) => grant !== null) ?? null;
}

function roleAccess(role: WorkspaceRole | null): DocumentAccess {
  switch (role) {
    case 'OWNER':
    case 'ADMIN':
      return 'MANAGE';
    case 'EDITOR':
      return 'EDIT';
    case 'VIEWER':
      return 'VIEW';
    default:
      return 'NONE';
  }
}

export function resolveDocumentAccess(input: DocumentAccessInput): DocumentAccess {
  const fromRole = roleAccess(input.workspaceRole);
  if (fromRole === 'MANAGE') {
    return fromRole;
  }
  const base = nearestGrant(input.grantChain) ?? fromRole;
  const fromLink =
    input.shareLinkLevel === 'EDIT' && !input.authenticated
      ? 'VIEW'
      : (input.shareLinkLevel ?? 'NONE');
  return strongest(base, fromLink);
}

export const canView = (access: DocumentAccess) => hasAccess(access, 'VIEW');
export const canEdit = (access: DocumentAccess) => hasAccess(access, 'EDIT');
export const canManage = (access: DocumentAccess) => hasAccess(access, 'MANAGE');

export const SHARE_TOKEN_PATTERN = /^[\w-]{32}$/;

export const activeShareLinkWhere = (now: Date): Prisma.ShareLinkWhereInput => ({
  revokedAt: null,
  OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
});

export function isShareLinkActive(
  link: { revokedAt: Date | null; expiresAt: Date | null },
  now: Date,
): boolean {
  return link.revokedAt === null && (link.expiresAt === null || link.expiresAt > now);
}
