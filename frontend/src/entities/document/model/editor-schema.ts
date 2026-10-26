import Image from '@tiptap/extension-image';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import StarterKit from '@tiptap/starter-kit';

export const CONTENT_FIELD = 'default';

export const COMMENTABLE_BLOCKS = ['paragraph', 'heading', 'codeBlock', 'image'];

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

export function normalizeLink(input: string): string | null {
  const value = input.trim();
  if (!value) {
    return null;
  }
  const candidate = /^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(candidate);
    return ALLOWED_PROTOCOLS.has(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

export function contentExtensions() {
  return [
    StarterKit.configure({
      undoRedo: false,
      blockquote: false,
      horizontalRule: false,
      underline: false,
      heading: { levels: [1, 2, 3] },
      link: {
        openOnClick: false,
        autolink: true,
        defaultProtocol: 'https',
        isAllowedUri: (url) => normalizeLink(url) !== null,
      },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Image.configure({
      inline: false,
      allowBase64: false,
      HTMLAttributes: { referrerpolicy: 'no-referrer', loading: 'lazy' },
    }),
  ];
}
