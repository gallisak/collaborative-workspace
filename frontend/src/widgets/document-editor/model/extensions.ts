import Collaboration, { isChangeOrigin } from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import UniqueID from '@tiptap/extension-unique-id';
import { Placeholder } from '@tiptap/extensions';
import { COMMENTABLE_BLOCKS, CONTENT_FIELD, contentExtensions } from '@/entities/document';
import type { CollabSession } from './collab-session';
import { CommentHighlight } from './comment-highlight';

interface CaretUser {
  name: string;
  color: string;
}

export function editorExtensions(session: CollabSession, user: CaretUser) {
  return [
    ...contentExtensions(),
    UniqueID.configure({
      types: COMMENTABLE_BLOCKS,
      filterTransaction: (transaction) => !isChangeOrigin(transaction),
    }),
    CommentHighlight,
    Placeholder.configure({ placeholder: 'Start writing…' }),
    Collaboration.configure({ document: session.doc, field: CONTENT_FIELD }),
    CollaborationCaret.configure({ provider: session.provider, user }),
  ];
}
