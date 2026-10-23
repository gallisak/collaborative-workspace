import {
  canEdit,
  canManage,
  canView,
  isShareLinkActive,
  nearestGrant,
  resolveDocumentAccess,
  type DocumentAccessInput,
} from './document-access.js';

const input = (overrides: Partial<DocumentAccessInput>): DocumentAccessInput => ({
  workspaceRole: null,
  grantChain: [],
  shareLinkLevel: null,
  authenticated: true,
  ...overrides,
});

describe('resolveDocumentAccess', () => {
  it.each([
    ['OWNER', 'MANAGE'],
    ['ADMIN', 'MANAGE'],
    ['EDITOR', 'EDIT'],
    ['VIEWER', 'VIEW'],
    [null, 'NONE'],
  ] as const)('maps workspace role %s to %s', (workspaceRole, expected) => {
    expect(resolveDocumentAccess(input({ workspaceRole }))).toBe(expected);
  });

  it('lets an explicit grant lower a workspace editor to viewer', () => {
    expect(resolveDocumentAccess(input({ workspaceRole: 'EDITOR', grantChain: ['VIEW'] }))).toBe(
      'VIEW',
    );
  });

  it('lets an explicit grant raise a workspace viewer to editor', () => {
    expect(resolveDocumentAccess(input({ workspaceRole: 'VIEWER', grantChain: ['EDIT'] }))).toBe(
      'EDIT',
    );
  });

  it('never restricts owners and admins', () => {
    expect(resolveDocumentAccess(input({ workspaceRole: 'ADMIN', grantChain: ['VIEW'] }))).toBe(
      'MANAGE',
    );
  });

  it('gives guests outside the workspace access through a grant', () => {
    expect(resolveDocumentAccess(input({ grantChain: [null, 'EDIT'] }))).toBe('EDIT');
  });

  it('uses the grant closest to the document', () => {
    expect(
      resolveDocumentAccess(input({ workspaceRole: 'EDITOR', grantChain: [null, 'VIEW', 'EDIT'] })),
    ).toBe('VIEW');
  });

  it('adds share link access on top of the resolved access', () => {
    expect(resolveDocumentAccess(input({ shareLinkLevel: 'VIEW' }))).toBe('VIEW');
    expect(resolveDocumentAccess(input({ workspaceRole: 'VIEWER', shareLinkLevel: 'EDIT' }))).toBe(
      'EDIT',
    );
    expect(resolveDocumentAccess(input({ workspaceRole: 'EDITOR', shareLinkLevel: 'VIEW' }))).toBe(
      'EDIT',
    );
  });

  it('downgrades an edit link to view for anonymous visitors', () => {
    expect(resolveDocumentAccess(input({ shareLinkLevel: 'EDIT', authenticated: false }))).toBe(
      'VIEW',
    );
  });
});

describe('access helpers', () => {
  it('compares access levels', () => {
    expect(canView('VIEW')).toBe(true);
    expect(canEdit('VIEW')).toBe(false);
    expect(canEdit('MANAGE')).toBe(true);
    expect(canManage('EDIT')).toBe(false);
    expect(canView('NONE')).toBe(false);
  });

  it('finds the nearest non-empty grant', () => {
    expect(nearestGrant([null, null])).toBeNull();
    expect(nearestGrant([null, 'EDIT', 'VIEW'])).toBe('EDIT');
  });
});

describe('isShareLinkActive', () => {
  const now = new Date('2026-10-23T12:00:00Z');

  it('accepts links without expiry', () => {
    expect(isShareLinkActive({ revokedAt: null, expiresAt: null }, now)).toBe(true);
  });

  it('rejects revoked and expired links', () => {
    expect(isShareLinkActive({ revokedAt: now, expiresAt: null }, now)).toBe(false);
    expect(isShareLinkActive({ revokedAt: null, expiresAt: now }, now)).toBe(false);
    expect(
      isShareLinkActive({ revokedAt: null, expiresAt: new Date('2026-10-24T00:00:00Z') }, now),
    ).toBe(true);
  });
});
