import { relativeTime } from './relative-time';

const now = new Date('2026-10-26T12:00:00Z').getTime();
const ago = (seconds: number) => new Date(now - seconds * 1000).toISOString();

describe('relativeTime', () => {
  it.each([
    [10, 'just now'],
    [90, '1 minute ago'],
    [150, '2 minutes ago'],
    [3600, '1 hour ago'],
    [26 * 3600, 'yesterday'],
    [10 * 24 * 3600, 'last week'],
  ])('formats %s seconds ago as %s', (seconds, expected) => {
    expect(relativeTime(ago(seconds), now)).toBe(expected);
  });
});
