export function isWithinRotationGrace(
  rotatedAt: Date | null,
  now: Date,
  graceSeconds: number,
): boolean {
  return rotatedAt !== null && now.getTime() - rotatedAt.getTime() <= graceSeconds * 1000;
}

export interface Rotation {
  rotatedAt: Date | null;
  rotatedFrom: string | null;
}

export function canReuseRotated(
  rotation: Rotation,
  client: string,
  now: Date,
  graceSeconds: number,
): boolean {
  return (
    rotation.rotatedFrom === client && isWithinRotationGrace(rotation.rotatedAt, now, graceSeconds)
  );
}
