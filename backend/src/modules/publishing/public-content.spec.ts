import * as Y from 'yjs';
import { describeContent, safeUrl, toPublicBlocks } from './public-content.js';

type Child = Y.XmlElement | Y.XmlText;

const el = (name: string, attrs: Record<string, unknown> = {}, children: Child[] = []) => {
  const element = new Y.XmlElement(name);
  for (const [key, value] of Object.entries(attrs)) {
    element.setAttribute(key, value as string);
  }
  element.insert(0, children);
  return element;
};

const text = (value: string, attributes?: Record<string, unknown>) => {
  const node = new Y.XmlText();
  node.insert(0, value, attributes);
  return node;
};

const render = (...nodes: Y.XmlElement[]) => {
  const doc = new Y.Doc();
  const fragment = doc.getXmlFragment('default');
  fragment.insert(0, nodes);
  return toPublicBlocks(fragment);
};

describe('toPublicBlocks', () => {
  it('converts the supported block types', () => {
    expect(
      render(
        el('heading', { level: 2 }, [text('Title')]),
        el('paragraph', {}, [text('Hello '), text('world', { bold: {} })]),
        el('bulletList', {}, [el('listItem', {}, [el('paragraph', {}, [text('item')])])]),
        el('taskList', {}, [
          el('taskItem', { checked: true }, [el('paragraph', {}, [text('done')])]),
        ]),
        el('codeBlock', { language: 'ts' }, [text('const a = 1;')]),
        el('image', { src: 'https://cdn.example/a.png', alt: 'Chart' }),
      ),
    ).toEqual([
      { type: 'heading', level: 2, content: [{ type: 'text', text: 'Title' }] },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Hello ' },
          { type: 'text', text: 'world', marks: [{ type: 'bold' }] },
        ],
      },
      {
        type: 'bulletList',
        items: [[{ type: 'paragraph', content: [{ type: 'text', text: 'item' }] }]],
      },
      {
        type: 'taskList',
        items: [
          {
            checked: true,
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'done' }] }],
          },
        ],
      },
      { type: 'codeBlock', language: 'ts', code: 'const a = 1;' },
      { type: 'image', src: 'https://cdn.example/a.png', alt: 'Chart' },
    ]);
  });

  it('drops unknown nodes such as raw html or scripts', () => {
    expect(
      render(el('script', {}, [text('alert(1)')]), el('iframe', { src: 'https://evil.example' })),
    ).toEqual([]);
  });

  it('removes dangerous links but keeps their text', () => {
    expect(
      render(el('paragraph', {}, [text('click', { link: { href: 'javascript:alert(1)' } })])),
    ).toEqual([{ type: 'paragraph', content: [{ type: 'text', text: 'click' }] }]);
  });

  it('keeps safe links normalized', () => {
    expect(
      render(el('paragraph', {}, [text('docs', { link: { href: 'https://example.com/a b' } })])),
    ).toEqual([
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'docs',
            marks: [{ type: 'link', href: 'https://example.com/a%20b' }],
          },
        ],
      },
    ]);
  });

  it('keeps images stored as workspace attachments', () => {
    const src = '/api/attachments/01a16800-0000-7000-8000-000000000001/content';
    expect(render(el('image', { src }))).toEqual([{ type: 'image', src, alt: null }]);
  });

  it('drops images with unsafe sources', () => {
    expect(
      render(
        el('image', { src: 'javascript:alert(1)' }),
        el('image', { src: 'data:image/svg+xml,<svg onload=alert(1)>' }),
        el('image', { src: '/relative.png' }),
        el('image', { src: '/api/attachments/x/../../auth/logout' }),
      ),
    ).toEqual([]);
  });

  it('ignores unexpected attributes and clamps values', () => {
    expect(
      render(
        el('heading', { level: 7, onclick: 'alert(1)' }, [text('H')]),
        el('codeBlock', { language: '"><script>' }, [text('x')]),
      ),
    ).toEqual([
      { type: 'heading', level: 1, content: [{ type: 'text', text: 'H' }] },
      { type: 'codeBlock', language: null, code: 'x' },
    ]);
  });

  it('keeps code blocks as plain text without formatting', () => {
    expect(render(el('codeBlock', {}, [text('a', { bold: {} }), text('b')]))).toEqual([
      { type: 'codeBlock', language: null, code: 'ab' },
    ]);
  });

  it('keeps markup-looking text as plain text', () => {
    expect(render(el('paragraph', {}, [text('<img src=x onerror=alert(1)>')]))).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: '<img src=x onerror=alert(1)>' }] },
    ]);
  });

  it('stops at a maximum nesting depth', () => {
    let node = el('paragraph', {}, [text('deep')]);
    for (let i = 0; i < 40; i++) {
      node = el('bulletList', {}, [el('listItem', {}, [node])]);
    }
    expect(JSON.stringify(render(node))).not.toContain('deep');
  });
});

describe('describeContent', () => {
  it('uses the text of the document', () => {
    const blocks = render(
      el('heading', {}, [text('Plan')]),
      el('paragraph', {}, [text('Ship   it')]),
    );
    expect(describeContent(blocks)).toBe('Plan Ship it');
  });

  it('cuts long text on a word boundary', () => {
    const blocks = render(el('paragraph', {}, [text('word '.repeat(100))]));
    const description = describeContent(blocks);
    expect(description.length).toBeLessThanOrEqual(160);
    expect(description.endsWith('word…')).toBe(true);
  });
});

describe('safeUrl', () => {
  it('accepts only listed protocols', () => {
    const http = new Set(['https:']);
    expect(safeUrl('https://a.example', http)).toBe('https://a.example/');
    expect(safeUrl('JAVASCRIPT:alert(1)', http)).toBeNull();
    expect(safeUrl(42, http)).toBeNull();
    expect(safeUrl(`https://a.example/${'x'.repeat(3000)}`, http)).toBeNull();
  });
});
