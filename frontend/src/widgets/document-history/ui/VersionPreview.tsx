'use client';

import Collaboration from '@tiptap/extension-collaboration';
import { EditorContent, useEditor } from '@tiptap/react';
import { useState } from 'react';
import { CONTENT_FIELD, contentExtensions } from '@/entities/document';
import { docFromState } from '../model/version-state';

export function VersionPreview({ state }: { state: string }) {
  const [doc] = useState(() => docFromState(state));
  const editor = useEditor(
    {
      immediatelyRender: false,
      editable: false,
      extensions: [
        ...contentExtensions(),
        Collaboration.configure({ document: doc, field: CONTENT_FIELD }),
      ],
      editorProps: {
        attributes: { class: 'document-content min-h-0 text-sm', 'aria-label': 'Version content' },
      },
    },
    [doc],
  );
  return <EditorContent editor={editor} />;
}
