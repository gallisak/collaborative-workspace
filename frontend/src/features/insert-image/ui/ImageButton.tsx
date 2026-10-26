'use client';

import type { Editor } from '@tiptap/react';
import { ImagePlus, Loader2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { notifyError } from '@/shared/lib';
import { Button } from '@/shared/ui/button';
import { IMAGE_TYPES, UploadError, uploadImage } from '../model/upload-image';

interface ImageButtonProps {
  editor: Editor;
  documentId: string;
  disabled: boolean;
}

export function ImageButton({ editor, documentId, disabled }: ImageButtonProps) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const upload = async (file: File | undefined) => {
    if (!file) {
      return;
    }
    setUploading(true);
    try {
      const image = await uploadImage(documentId, file);
      editor.chain().focus().setImage(image).run();
    } catch (error) {
      if (error instanceof UploadError) {
        toast.error(error.message);
      } else {
        notifyError(error);
      }
    } finally {
      setUploading(false);
      if (input.current) {
        input.current.value = '';
      }
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Insert image"
        disabled={disabled || uploading}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => input.current?.click()}
      >
        {uploading ? <Loader2 className="animate-spin" /> : <ImagePlus />}
      </Button>
      <input
        ref={input}
        type="file"
        accept={IMAGE_TYPES.join(',')}
        className="hidden"
        aria-label="Image file"
        onChange={(event) => upload(event.target.files?.[0])}
      />
    </>
  );
}
