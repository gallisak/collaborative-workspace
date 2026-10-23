import { prefixQuery } from './search-query.js';

describe('prefixQuery', () => {
  it('turns words into prefix terms that all must match', () => {
    expect(prefixQuery('Roadmap Q4')).toBe('roadmap:* & q4:*');
  });

  it('supports any alphabet', () => {
    expect(prefixQuery('План запуску')).toBe('план:* & запуску:*');
  });

  it('strips tsquery operators so input cannot change the query', () => {
    expect(prefixQuery("a' | !b & (c:*) <-> d")).toBe('a:* & b:* & c:* & d:*');
  });

  it('returns null when there is nothing to search for', () => {
    expect(prefixQuery('  !!! ')).toBeNull();
  });

  it('removes duplicates and limits the number of terms', () => {
    expect(prefixQuery('a a b')).toBe('a:* & b:*');
    expect(prefixQuery('w '.repeat(5) + 'a b c d e f g h i j k l')?.split(' & ')).toHaveLength(10);
  });
});
