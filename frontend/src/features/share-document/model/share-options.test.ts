import { expiresAt } from './share-options';

describe('expiresAt', () => {
  const now = Date.UTC(2026, 9, 26, 12, 0, 0);

  it('leaves a link without expiry open-ended', () => {
    expect(expiresAt('never', now)).toBeUndefined();
  });

  it.each([
    ['1d', '2026-10-27T12:00:00.000Z'],
    ['7d', '2026-11-02T12:00:00.000Z'],
    ['30d', '2026-11-25T12:00:00.000Z'],
  ] as const)('counts %s from now', (option, expected) => {
    expect(expiresAt(option, now)).toBe(expected);
  });
});
