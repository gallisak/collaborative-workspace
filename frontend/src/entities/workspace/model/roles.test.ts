import { assignableRoles, canEditContent, hasRoleAtLeast } from './roles';

describe('workspace roles', () => {
  it('orders roles from viewer to owner', () => {
    expect(hasRoleAtLeast('ADMIN', 'EDITOR')).toBe(true);
    expect(hasRoleAtLeast('VIEWER', 'EDITOR')).toBe(false);
    expect(canEditContent('VIEWER')).toBe(false);
    expect(canEditContent('EDITOR')).toBe(true);
  });

  it('lets managers assign only roles below their own', () => {
    expect(assignableRoles('OWNER')).toEqual(['ADMIN', 'EDITOR', 'VIEWER']);
    expect(assignableRoles('ADMIN')).toEqual(['EDITOR', 'VIEWER']);
    expect(assignableRoles('EDITOR')).toEqual([]);
  });
});
