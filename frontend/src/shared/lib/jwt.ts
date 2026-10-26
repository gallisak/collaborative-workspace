export function tokenExpiresAt(token: string | undefined): number | null {
  const payload = token?.split('.')[1];
  if (!payload) {
    return null;
  }
  try {
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const { exp } = JSON.parse(json) as { exp?: unknown };
    return typeof exp === 'number' ? exp * 1000 : null;
  } catch {
    return null;
  }
}

export const isTokenFresh = (token: string | undefined, now: number, leewayMs: number) => {
  const expiresAt = tokenExpiresAt(token);
  return expiresAt !== null && expiresAt - leewayMs > now;
};
