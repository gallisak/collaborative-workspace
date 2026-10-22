const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export interface OriginCheckInput {
  method: string;
  origin: string | undefined;
  hasSessionCookie: boolean;
}

export function isRequestFromAllowedOrigin(
  { method, origin, hasSessionCookie }: OriginCheckInput,
  allowedOrigins: readonly string[],
): boolean {
  if (SAFE_METHODS.has(method.toUpperCase())) {
    return true;
  }
  if (origin !== undefined) {
    return allowedOrigins.includes(origin);
  }
  return !hasSessionCookie;
}
