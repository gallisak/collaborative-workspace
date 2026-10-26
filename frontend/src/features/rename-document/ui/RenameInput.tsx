'use client';

import { useState } from 'react';
import { Input } from '@/shared/ui/input';
import { MAX_TITLE_LENGTH, useRenameDocument } from '../model/use-rename-document';

interface RenameInputProps {
  documentId: string;
  title: string;
  onDone: () => void;
}

export function RenameInput({ documentId, title, onDone }: RenameInputProps) {
  const rename = useRenameDocument();
  const [value, setValue] = useState(title);

  const commit = async () => {
    await rename(documentId, value, title);
    onDone();
  };

  return (
    <Input
      autoFocus
      aria-label="Page title"
      value={value}
      maxLength={MAX_TITLE_LENGTH}
      className="h-7 px-1.5 text-sm"
      onChange={(event) => setValue(event.target.value)}
      onFocus={(event) => event.target.select()}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.currentTarget.blur();
        }
        if (event.key === 'Escape') {
          onDone();
        }
      }}
    />
  );
}
