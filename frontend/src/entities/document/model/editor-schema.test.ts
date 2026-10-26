import { normalizeLink } from './editor-schema';

describe('normalizeLink', () => {
  it('accepts web and mail links, adding https when missing', () => {
    expect(normalizeLink('https://example.com/a')).toBe('https://example.com/a');
    expect(normalizeLink('example.com')).toBe('https://example.com/');
    expect(normalizeLink('mailto:ann@example.com')).toBe('mailto:ann@example.com');
  });

  it.each(['javascript:alert(1)', 'data:text/html,<b>x</b>', 'vbscript:x', '', '   '])(
    'rejects %s',
    (value) => {
      expect(normalizeLink(value)).toBeNull();
    },
  );
});
