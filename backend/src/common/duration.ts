const UNIT_SECONDS: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86_400 };

export const DURATION_PATTERN = /^(\d+)([smhd])?$/;

export function durationToSeconds(value: string): number {
  const match = DURATION_PATTERN.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid duration "${value}", expected e.g. 900, 15m, 7d`);
  }
  return Number(match[1]) * UNIT_SECONDS[match[2] ?? 's'];
}
