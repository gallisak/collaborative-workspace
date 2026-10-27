import * as Y from 'yjs';
import { ATTACHMENT_PATH } from '../attachments/attachment-rules.js';

export type PublicMark =
  { type: 'bold' | 'italic' | 'strike' | 'code' } | { type: 'link'; href: string };

export type PublicInline =
  { type: 'text'; text: string; marks?: PublicMark[] } | { type: 'hardBreak' };

export type PublicBlock =
  | { type: 'paragraph'; content: PublicInline[] }
  | { type: 'heading'; level: 1 | 2 | 3; content: PublicInline[] }
  | { type: 'bulletList' | 'orderedList'; items: PublicBlock[][] }
  | { type: 'taskList'; items: { checked: boolean; content: PublicBlock[] }[] }
  | { type: 'codeBlock'; language: string | null; code: string }
  | { type: 'image'; src: string; alt: string | null };

const MAX_DEPTH = 16;
const MAX_URL_LENGTH = 2048;
const MAX_ALT_LENGTH = 500;
const DESCRIPTION_LENGTH = 160;
const LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);
const IMAGE_PROTOCOLS = new Set(['https:']);
const SIMPLE_MARKS = ['bold', 'italic', 'strike', 'code'] as const;
const LANGUAGE = /^[\w+#-]{1,32}$/;

type YNode = Y.XmlElement | Y.XmlText | Y.XmlHook;

export function safeUrl(value: unknown, protocols: ReadonlySet<string>): string | null {
  if (typeof value !== 'string' || value.length > MAX_URL_LENGTH) {
    return null;
  }
  try {
    const url = new URL(value);
    return protocols.has(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

const imageSource = (value: unknown) =>
  typeof value === 'string' && ATTACHMENT_PATH.test(value)
    ? value
    : safeUrl(value, IMAGE_PROTOCOLS);

const elements = (node: Y.XmlElement | Y.XmlFragment, name?: string) =>
  node
    .toArray()
    .filter(
      (child): child is Y.XmlElement =>
        child instanceof Y.XmlElement && (name === undefined || child.nodeName === name),
    );

function marksOf(attributes: Record<string, unknown> | undefined): PublicMark[] {
  if (!attributes) {
    return [];
  }
  const marks: PublicMark[] = SIMPLE_MARKS.filter((type) => attributes[type]).map((type) => ({
    type,
  }));
  const link = attributes.link as { href?: unknown } | undefined;
  const href = safeUrl(link?.href, LINK_PROTOCOLS);
  if (href) {
    marks.push({ type: 'link', href });
  }
  return marks;
}

interface TextOp {
  insert: string;
  attributes?: Record<string, unknown>;
}

const textOps = (text: Y.XmlText) =>
  (text.toDelta() as { insert: unknown; attributes?: Record<string, unknown> }[]).filter(
    (op): op is TextOp => typeof op.insert === 'string' && op.insert.length > 0,
  );

function inline(element: Y.XmlElement): PublicInline[] {
  return element.toArray().flatMap((child: YNode): PublicInline[] => {
    if (child instanceof Y.XmlText) {
      return textOps(child).map((op) => {
        const marks = marksOf(op.attributes);
        return { type: 'text', text: op.insert, ...(marks.length > 0 && { marks }) };
      });
    }
    return child instanceof Y.XmlElement && child.nodeName === 'hardBreak'
      ? [{ type: 'hardBreak' }]
      : [];
  });
}

const plainText = (element: Y.XmlElement) =>
  element
    .toArray()
    .flatMap((child) => (child instanceof Y.XmlText ? textOps(child) : []))
    .map((op) => op.insert)
    .join('');

const headingLevel = (value: unknown): 1 | 2 | 3 => {
  const level = Number(value);
  return level === 2 || level === 3 ? level : 1;
};

function block(element: Y.XmlElement, depth: number): PublicBlock | null {
  switch (element.nodeName) {
    case 'paragraph':
      return { type: 'paragraph', content: inline(element) };
    case 'heading':
      return {
        type: 'heading',
        level: headingLevel(element.getAttribute('level')),
        content: inline(element),
      };
    case 'bulletList':
    case 'orderedList':
      return {
        type: element.nodeName,
        items: elements(element, 'listItem').map((item) => blocks(item, depth + 1)),
      };
    case 'taskList':
      return {
        type: 'taskList',
        items: elements(element, 'taskItem').map((item) => ({
          checked: (item.getAttribute('checked') as unknown) === true,
          content: blocks(item, depth + 1),
        })),
      };
    case 'codeBlock': {
      const language: unknown = element.getAttribute('language');
      return {
        type: 'codeBlock',
        language: typeof language === 'string' && LANGUAGE.test(language) ? language : null,
        code: plainText(element),
      };
    }
    case 'image': {
      const src = imageSource(element.getAttribute('src'));
      const alt: unknown = element.getAttribute('alt');
      return src
        ? {
            type: 'image',
            src,
            alt: typeof alt === 'string' && alt ? alt.slice(0, MAX_ALT_LENGTH) : null,
          }
        : null;
    }
    default:
      return null;
  }
}

function blocks(parent: Y.XmlElement | Y.XmlFragment, depth: number): PublicBlock[] {
  if (depth > MAX_DEPTH) {
    return [];
  }
  return elements(parent).flatMap((element) => block(element, depth) ?? []);
}

export const toPublicBlocks = (fragment: Y.XmlFragment): PublicBlock[] => blocks(fragment, 0);

function textOf(blocks: readonly PublicBlock[]): string[] {
  return blocks.flatMap((item) => {
    switch (item.type) {
      case 'paragraph':
      case 'heading':
        return [item.content.map((part) => (part.type === 'text' ? part.text : ' ')).join('')];
      case 'bulletList':
      case 'orderedList':
        return item.items.flatMap(textOf);
      case 'taskList':
        return item.items.flatMap(({ content }) => textOf(content));
      default:
        return [];
    }
  });
}

export function describeContent(blocks: readonly PublicBlock[]): string {
  const text = textOf(blocks).join(' ').replace(/\s+/g, ' ').trim();
  if (text.length <= DESCRIPTION_LENGTH) {
    return text;
  }
  const cut = text.slice(0, DESCRIPTION_LENGTH - 1);
  const wordEnd = cut.lastIndexOf(' ');
  return `${wordEnd > 0 ? cut.slice(0, wordEnd) : cut}…`;
}
