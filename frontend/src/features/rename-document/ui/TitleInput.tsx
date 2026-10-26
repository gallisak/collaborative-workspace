'use client';

import { useState } from 'react';
import { MAX_TITLE_LENGTH, useRenameDocument } from '../model/use-rename-document';

export function TitleInput({ documentId, title }: { documentId: string; title: string }) {
  const rename = useRenameDocument();
  const [saved, setSaved] = useState(title);
  const [value, setValue] = useState(title);

  const commit = async () => {
    if (await rename(documentId, value, saved)) {
      setSaved(value.trim());
    } else {
      setValue(saved);
    }
  };

  return (
    <input
      aria-label="Page title"
      value={value}
      maxLength={MAX_TITLE_LENGTH}
      placeholder="Untitled"
      className="placeholder:text-muted-foreground w-full bg-transparent text-4xl font-bold tracking-tight outline-none"
      onChange={(event) => setValue(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.currentTarget.blur();
        }
        if (event.key === 'Escape') {
          setValue(saved);
          event.currentTarget.blur();
        }
      }}
    />
  );
}
