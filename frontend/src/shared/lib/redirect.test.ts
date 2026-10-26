import { loginPath, safeNextPath } from './redirect';

describe('safeNextPath', () => {
  it('keeps relative paths with query and hash', () => {
    expect(safeNextPath('/w/1/d/2?view=1#block')).toBe('/w/1/d/2?view=1#block');
  });

  it.each([
    'https://evil.example',
    '//evil.example/path',
    '/\\evil.example',
    'javascript:alert(1)',
    'w/1',
    '',
    null,
    undefined,
  ])('falls back for %s', (value) => {
    expect(safeNextPath(value)).toBe('/workspaces');
  });

  it('never sends the user back to the auth pages', () => {
    expect(safeNextPath('/login')).toBe('/workspaces');
    expect(safeNextPath('/register?next=/x')).toBe('/workspaces');
  });
});

describe('loginPath', () => {
  it('remembers where to come back to', () => {
    expect(loginPath('/w/1?x=1')).toBe('/login?next=%2Fw%2F1%3Fx%3D1');
  });

  it('drops unsafe targets', () => {
    expect(loginPath('https://evil.example')).toBe('/login');
    expect(loginPath()).toBe('/login');
  });
});
