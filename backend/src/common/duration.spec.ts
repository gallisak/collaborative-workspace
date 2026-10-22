import { durationToSeconds } from './duration.js';

describe('durationToSeconds', () => {
  it.each([
    ['900', 900],
    ['30s', 30],
    ['15m', 900],
    ['2h', 7200],
    ['7d', 604_800],
  ])('parses %s', (input, expected) => {
    expect(durationToSeconds(input)).toBe(expected);
  });

  it.each(['', '15 minutes', '-5m', '1.5h', '10w'])('rejects %s', (input) => {
    expect(() => durationToSeconds(input)).toThrow(/Invalid duration/);
  });
});
