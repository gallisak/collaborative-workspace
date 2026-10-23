import * as Y from 'yjs';
import { documentText, MAX_INDEXED_CHARS } from './document-text.js';

const el = (name: string, children: (Y.XmlElement | Y.XmlText)[]) => {
  const element = new Y.XmlElement(name);
  element.insert(0, children);
  return element;
};

const text = (value: string, attributes?: Record<string, unknown>) => {
  const node = new Y.XmlText();
  node.insert(0, value, attributes);
  return node;
};

const fragmentOf = (...nodes: Y.XmlElement[]) => {
  const fragment = new Y.Doc().getXmlFragment('default');
  fragment.insert(0, nodes);
  return fragment;
};

describe('documentText', () => {
  it('extracts the text of every block, one per line, without formatting', () => {
    const fragment = fragmentOf(
      el('heading', [text('Plan')]),
      el('paragraph', [text('Ship '), text('fast', { bold: {} })]),
      el('bulletList', [el('listItem', [el('paragraph', [text('item')])])]),
      el('codeBlock', [text('npm run build')]),
      el('paragraph', []),
    );

    expect(documentText(fragment)).toBe('Plan\nShip fast\nitem\nnpm run build');
  });

  it('caps the indexed text', () => {
    const fragment = fragmentOf(el('paragraph', [text('x'.repeat(MAX_INDEXED_CHARS + 10))]));

    expect(documentText(fragment)).toHaveLength(MAX_INDEXED_CHARS);
  });
});
