import { API_PREFIX } from '../../common/api-prefix.js';
import { PlanLimitExceededException } from '../../common/errors/plan-limit.exception.js';

export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
export const ATTACHMENT_PATH = new RegExp(`^/${API_PREFIX}/attachments/${UUID}/content$`);
const MAX_FILE_NAME = 200;
const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

export const attachmentPath = (attachmentId: string) =>
  `/${API_PREFIX}/attachments/${attachmentId}/content`;

export const objectKey = (workspaceId: string, key: string) => `workspaces/${workspaceId}/${key}`;

export function cleanFileName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? '';
  const cleaned = base
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .trim()
    .slice(0, MAX_FILE_NAME);
  return cleaned || 'image';
}

export function formatBytes(bytes: bigint | number): string {
  let value = Number(bytes);
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${Number.isInteger(value) ? value : value.toFixed(1)} ${UNITS[unit]}`;
}

export function assertStorage(
  plan: { name: string; maxStorageBytes: bigint | null },
  usedBytes: bigint,
  sizeBytes: bigint,
) {
  if (plan.maxStorageBytes !== null && usedBytes + sizeBytes > plan.maxStorageBytes) {
    throw new PlanLimitExceededException(
      'of storage',
      plan.name,
      formatBytes(plan.maxStorageBytes),
    );
  }
}
