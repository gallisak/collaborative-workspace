import { formatBytes, formatLimit, formatPrice, usageShare } from './format';

describe('plan formatting', () => {
  it('shows monthly prices in dollars', () => {
    expect(formatPrice(0)).toBe('Free');
    expect(formatPrice(1200)).toBe('$12/month');
    expect(formatPrice(1250)).toBe('$12.50/month');
  });

  it.each([
    [512, '512 B'],
    [1536, '1.5 KB'],
    [100 * 1024 * 1024, '100 MB'],
    [10 * 1024 ** 3, '10 GB'],
  ])('formats %d bytes as %s', (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });

  it('treats a missing limit as unlimited', () => {
    expect(formatLimit(null)).toBe('Unlimited');
    expect(formatLimit(5)).toBe('5');
    expect(formatLimit(1024, formatBytes)).toBe('1 KB');
  });

  it('caps the usage bar at the limit', () => {
    expect(usageShare(3, 10)).toBe(30);
    expect(usageShare(12, 10)).toBe(100);
    expect(usageShare(3, null)).toBe(0);
  });
});
