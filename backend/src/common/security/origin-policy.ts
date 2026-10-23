const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export interface OriginCheckInput {
  method: string;
  origin: string | undefined;
  ownOrigin: string;
  hasSessionCookie: boolean;
}

export function isRequestFromAllowedOrigin(
  { method, origin, ownOrigin, hasSessionCookie }: OriginCheckInput,
  allowedOrigins: readonly string[],
): boolean {
  if (SAFE_METHODS.has(method.toUpperCase())) {
    return true;
  }
  if (origin !== undefined) {
    return origin === ownOrigin || allowedOrigins.includes(origin);
  }
  return !hasSessionCookie;
}
