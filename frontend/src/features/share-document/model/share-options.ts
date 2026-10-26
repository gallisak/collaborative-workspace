import type { AccessLevel } from '@/shared/api';

const DAY_MS = 24 * 60 * 60 * 1000;

export const ACCESS_LEVELS = ['VIEW', 'EDIT'] as const satisfies readonly AccessLevel[];

export const ACCESS_LABELS: Record<AccessLevel, string> = {
  VIEW: 'Can view',
  EDIT: 'Can edit',
};

export const EXPIRY_OPTIONS = [
  { value: 'never', label: 'Never expires', days: null },
  { value: '1d', label: 'Expires in 1 day', days: 1 },
  { value: '7d', label: 'Expires in 7 days', days: 7 },
  { value: '30d', label: 'Expires in 30 days', days: 30 },
] as const;

export type ExpiryOption = (typeof EXPIRY_OPTIONS)[number]['value'];

export const EXPIRY_VALUES = EXPIRY_OPTIONS.map((option) => option.value) as [
  ExpiryOption,
  ...ExpiryOption[],
];

export function expiresAt(option: ExpiryOption, now: number): string | undefined {
  const days = EXPIRY_OPTIONS.find((item) => item.value === option)?.days;
  return days ? new Date(now + days * DAY_MS).toISOString() : undefined;
}
