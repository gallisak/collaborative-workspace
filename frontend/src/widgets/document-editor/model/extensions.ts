import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import Image from '@tiptap/extension-image';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Placeholder } from '@tiptap/extensions';
import StarterKit from '@tiptap/starter-kit';
import type { CollabSession } from './collab-session';
import { normalizeLink } from './link';

export const CONTENT_FIELD = 'default';

interface CaretUser {
  name: string;
  color: string;
}

export function editorExtensions(session: CollabSession, user: CaretUser) {
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
    Image.configure({ inline: false, allowBase64: false }),
    Placeholder.configure({ placeholder: 'Start writing…' }),
    Collaboration.configure({ document: session.doc, field: CONTENT_FIELD }),
    CollaborationCaret.configure({ provider: session.provider, user }),
  ];
}
