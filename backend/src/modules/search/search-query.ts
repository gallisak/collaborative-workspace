const TERM = /[\p{L}\p{N}]+/gu;
const MAX_TERMS = 10;

export function prefixQuery(input: string): string | null {
  const terms = [...new Set(input.toLowerCase().match(TERM) ?? [])].slice(0, MAX_TERMS);
  return terms.length > 0 ? terms.map((term) => `${term}:*`).join(' & ') : null;
}
