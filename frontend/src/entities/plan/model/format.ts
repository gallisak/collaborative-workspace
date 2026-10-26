const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];
const price = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  trailingZeroDisplay: 'stripIfInteger',
});

export const formatAmount = (priceMinor: number) => price.format(priceMinor / 100);

export const formatPrice = (priceMinor: number) =>
  priceMinor === 0 ? 'Free' : `${formatAmount(priceMinor)}/month`;

export function formatBytes(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${Number.isInteger(value) ? value : value.toFixed(1)} ${UNITS[unit]}`;
}

export const formatLimit = (limit: number | null, format: (value: number) => string = String) =>
  limit === null ? 'Unlimited' : format(limit);

export const usageShare = (used: number, limit: number | null) =>
  limit === null || limit === 0 ? 0 : Math.min(100, Math.round((used / limit) * 100));
