export function isWithinRotationGrace(
  rotatedAt: Date | null,
  now: Date,
  graceSeconds: number,
): boolean {
  return rotatedAt !== null && now.getTime() - rotatedAt.getTime() <= graceSeconds * 1000;
}
