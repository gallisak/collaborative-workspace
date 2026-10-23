import {
  canAssignRole,
  canChangeRole,
  canManageMembers,
  canRemoveMember,
  hasRoleAtLeast,
} from './workspace-roles.js';

describe('workspace roles', () => {
  it('orders roles from viewer to owner', () => {
    expect(hasRoleAtLeast('OWNER', 'ADMIN')).toBe(true);
    expect(hasRoleAtLeast('EDITOR', 'EDITOR')).toBe(true);
    expect(hasRoleAtLeast('VIEWER', 'EDITOR')).toBe(false);
  });

  it('lets only owners and admins manage members', () => {
    expect(canManageMembers('OWNER')).toBe(true);
    expect(canManageMembers('ADMIN')).toBe(true);
    expect(canManageMembers('EDITOR')).toBe(false);
    expect(canManageMembers('VIEWER')).toBe(false);
  });

  it.each([
    ['OWNER', 'ADMIN', true],
    ['OWNER', 'VIEWER', true],
    ['OWNER', 'OWNER', false],
    ['ADMIN', 'EDITOR', true],
    ['ADMIN', 'ADMIN', false],
    ['EDITOR', 'VIEWER', false],
  ] as const)('%s assigning %s -> %s', (actor, target, expected) => {
    expect(canAssignRole(actor, target)).toBe(expected);
  });

  it('does not let admins change other admins or the owner', () => {
    expect(canChangeRole('ADMIN', 'ADMIN', 'EDITOR')).toBe(false);
    expect(canChangeRole('ADMIN', 'OWNER', 'EDITOR')).toBe(false);
    expect(canChangeRole('ADMIN', 'VIEWER', 'EDITOR')).toBe(true);
    expect(canChangeRole('OWNER', 'ADMIN', 'VIEWER')).toBe(true);
    expect(canChangeRole('OWNER', 'EDITOR', 'OWNER')).toBe(false);
  });

  it('lets anyone but the owner leave', () => {
    expect(canRemoveMember({ userId: 'a', role: 'VIEWER' }, { userId: 'a', role: 'VIEWER' })).toBe(
      true,
    );
    expect(canRemoveMember({ userId: 'o', role: 'OWNER' }, { userId: 'o', role: 'OWNER' })).toBe(
      false,
    );
  });

  it('lets managers remove only lower roles', () => {
    expect(canRemoveMember({ userId: 'o', role: 'OWNER' }, { userId: 'a', role: 'ADMIN' })).toBe(
      true,
    );
    expect(canRemoveMember({ userId: 'a', role: 'ADMIN' }, { userId: 'b', role: 'ADMIN' })).toBe(
      false,
    );
    expect(canRemoveMember({ userId: 'e', role: 'EDITOR' }, { userId: 'v', role: 'VIEWER' })).toBe(
      false,
    );
  });
});
