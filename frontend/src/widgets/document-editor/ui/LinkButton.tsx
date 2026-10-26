'use client';

import type { Editor } from '@tiptap/react';
import { Link2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { normalizeLink } from '../model/link';

interface LinkButtonProps {
  editor: Editor;
  active: boolean;
  disabled: boolean;
}

export function LinkButton({ editor, active, disabled }: LinkButtonProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [invalid, setInvalid] = useState(false);

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setValue((editor.getAttributes('link').href as string | undefined) ?? '');
      setInvalid(false);
    }
  };

  const apply = () => {
    const href = value.trim() ? normalizeLink(value) : null;
    if (value.trim() && !href) {
      return setInvalid(true);
    }
    const chain = editor.chain().focus().extendMarkRange('link');
    (href ? chain.setLink({ href }) : chain.unsetLink()).run();
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Link"
          aria-pressed={active}
          disabled={disabled}
          className={active ? 'bg-accent' : undefined}
        >
          <Link2 />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <form
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            apply();
          }}
        >
          <Input
            autoFocus
            aria-label="Link address"
            aria-invalid={invalid || undefined}
            placeholder="https://example.com"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setInvalid(false);
            }}
          />
          {invalid && (
            <p role="alert" className="text-destructive text-xs">
              Use a web or email address
            </p>
          )}
          <Button type="submit" size="sm">
            {value.trim() ? 'Apply' : 'Remove link'}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
