'use client';

import { Plus } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { useCreateDocument } from '../model/use-create-document';

export function NewPageButton() {
  const { create, creating } = useCreateDocument();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="w-full justify-start"
      disabled={creating}
      onClick={() => create(null)}
    >
      <Plus />
      New page
    </Button>
  );
}
