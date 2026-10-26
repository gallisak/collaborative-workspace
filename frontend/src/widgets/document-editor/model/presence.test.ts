import { collaboratorsFrom, colorFor, PRESENCE_COLORS } from './presence';

describe('colorFor', () => {
  it('gives each user a stable color from the palette', () => {
    expect(colorFor('user-1')).toBe(colorFor('user-1'));
    expect(PRESENCE_COLORS).toContain(colorFor('user-2'));
  });
});

describe('collaboratorsFrom', () => {
  it('lists other people once, even with several tabs open', () => {
    const states = [
      { user: { id: 'me', name: 'Me', color: '#000' } },
      { user: { id: 'b', name: 'Bob', color: '#111' } },
      { user: { id: 'b', name: 'Bob', color: '#111' } },
      { user: { id: 'a', name: 'Ann', color: '#222' } },
      {},
    ];
    expect(collaboratorsFrom(states, 'me')).toEqual([
      { id: 'a', name: 'Ann', color: '#222' },
      { id: 'b', name: 'Bob', color: '#111' },
    ]);
  });
});
