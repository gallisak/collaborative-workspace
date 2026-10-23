import * as Y from 'yjs';

export const MAX_INDEXED_CHARS = 200_000;

function collect(node: Y.XmlElement | Y.XmlFragment, lines: string[]) {
  let line = '';
  for (const child of node.toArray()) {
    if (child instanceof Y.XmlText) {
      for (const op of child.toDelta() as { insert: unknown }[]) {
        if (typeof op.insert === 'string') {
          line += op.insert;
        }
      }
    } else if (child instanceof Y.XmlElement) {
      collect(child, lines);
    }
  }
  if (line.trim()) {
    lines.push(line.trim());
  }
}

export function documentText(fragment: Y.XmlFragment): string {
  const lines: string[] = [];
  collect(fragment, lines);
  return lines.join('\n').slice(0, MAX_INDEXED_CHARS);
}
