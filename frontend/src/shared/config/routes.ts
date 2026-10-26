export const routes = {
  home: '/',
  login: '/login',
  register: '/register',
  workspaces: '/workspaces',
  sessionExpired: '/auth/session-expired',
  workspace: (workspaceId: string) => `/w/${workspaceId}`,
  workspaceSettings: (workspaceId: string) => `/w/${workspaceId}/settings`,
  document: (workspaceId: string, documentId: string) => `/w/${workspaceId}/d/${documentId}`,
} as const;
