const DOCUMENT_PATH =
  /^\/documents\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i;

export function documentIdFromUrl(url: string | undefined): string | null {
  const path = new URL(url ?? '/', 'http://collab.local').pathname;
  return DOCUMENT_PATH.exec(path)?.[1].toLowerCase() ?? null;
}

export function isAllowedOrigin(origin: string | undefined, allowed: readonly string[]): boolean {
  return origin !== undefined && allowed.includes(origin);
}
