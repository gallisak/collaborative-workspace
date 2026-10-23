import { SHARE_TOKEN_PATTERN } from '../permissions/document-access.js';

const DOCUMENT_PATH =
  /^\/documents\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i;

const parse = (url: string | undefined) => new URL(url ?? '/', 'http://collab.local');

export function documentIdFromUrl(url: string | undefined): string | null {
  return DOCUMENT_PATH.exec(parse(url).pathname)?.[1].toLowerCase() ?? null;
}

export function shareTokenFromUrl(url: string | undefined): string | null {
  const token = parse(url).searchParams.get('share');
  return token !== null && SHARE_TOKEN_PATTERN.test(token) ? token : null;
}

export function isAllowedOrigin(origin: string | undefined, allowed: readonly string[]): boolean {
  return origin !== undefined && allowed.includes(origin);
}
