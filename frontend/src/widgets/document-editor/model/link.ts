const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

export function normalizeLink(input: string): string | null {
  const value = input.trim();
  if (!value) {
    return null;
  }
  const candidate = /^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(candidate);
    return ALLOWED_PROTOCOLS.has(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
