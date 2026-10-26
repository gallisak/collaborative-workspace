import { publicBlocksSchema } from './blocks';

const paragraph = (marks: unknown[]) => ({
  type: 'paragraph',
  content: [{ type: 'text', text: 'Hi', marks }],
});

describe('publicBlocksSchema', () => {
  it('accepts every supported block type', () => {
    const blocks = [
      { type: 'heading', level: 2, content: [{ type: 'text', text: 'Title' }] },
      paragraph([{ type: 'bold' }, { type: 'link', href: 'https://example.com/' }]),
      { type: 'bulletList', items: [[paragraph([])]] },
      { type: 'orderedList', items: [[paragraph([])]] },
      { type: 'taskList', items: [{ checked: true, content: [paragraph([])] }] },
      { type: 'codeBlock', language: 'ts', code: 'const a = 1;' },
      {
        type: 'image',
        src: '/api/attachments/0f8fad5b-d9cb-469f-a165-70867728950e/content',
        alt: null,
      },
    ];

    expect(publicBlocksSchema.parse(blocks)).toEqual(blocks);
  });

  it.each([
    ['a script link', [paragraph([{ type: 'link', href: 'javascript:alert(1)' }])]],
    ['a data link', [paragraph([{ type: 'link', href: 'data:text/html,<script>' }])]],
    ['a data image', [{ type: 'image', src: 'data:image/svg+xml,<svg/>', alt: null }]],
    ['a foreign API path', [{ type: 'image', src: '/api/auth/logout', alt: null }]],
    ['an unknown block', [{ type: 'iframe', src: 'https://example.com' }]],
    ['raw HTML', [{ type: 'html', html: '<img onerror=alert(1)>' }]],
    ['an unsafe language', [{ type: 'codeBlock', language: '"><script>', code: '' }]],
    ['a heading level', [{ type: 'heading', level: 7, content: [] }]],
  ])('rejects %s', (_, blocks) => {
    expect(publicBlocksSchema.safeParse(blocks).success).toBe(false);
  });
});
