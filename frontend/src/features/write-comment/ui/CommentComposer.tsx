'use client';

import { useId, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/shared/lib';
import { Button } from '@/shared/ui/button';
import { Textarea } from '@/shared/ui/textarea';
import {
  type ActiveMention,
  activeMention,
  insertMention,
  matchCandidates,
  type MentionCandidate,
  mentionedIds,
} from '../model/mentions';

export const MAX_COMMENT_LENGTH = 5000;

export interface CommentDraft {
  body: string;
  mentionedUserIds: string[];
}

interface CommentComposerProps {
  candidates: readonly MentionCandidate[];
  placeholder: string;
  submitLabel: string;
  autoFocus?: boolean;
  onSubmit: (draft: CommentDraft) => Promise<boolean>;
  onCancel?: () => void;
}

export function CommentComposer({
  candidates,
  placeholder,
  submitLabel,
  autoFocus,
  onSubmit,
  onCancel,
}: CommentComposerProps) {
  const listId = useId();
  const input = useRef<HTMLTextAreaElement>(null);
  const pendingCaret = useRef<number | null>(null);
  const [text, setText] = useState('');
  const [picked, setPicked] = useState<MentionCandidate[]>([]);
  const [mention, setMention] = useState<ActiveMention | null>(null);
  const [highlighted, setHighlighted] = useState(0);
  const [sending, setSending] = useState(false);
  const options = mention ? matchCandidates(candidates, mention.query) : [];
  const open = mention !== null && options.length > 0;

  useLayoutEffect(() => {
    const caret = pendingCaret.current;
    if (caret !== null && input.current) {
      input.current.setSelectionRange(caret, caret);
      pendingCaret.current = null;
    }
  }, [text]);

  const track = (value: string, caret: number) => {
    setText(value);
    setMention(activeMention(value, caret));
    setHighlighted(0);
  };

  const pick = (candidate: MentionCandidate) => {
    const element = input.current;
    if (!mention || !element) {
      return;
    }
    const next = insertMention(text, mention, element.selectionStart, candidate.name);
    pendingCaret.current = next.caret;
    setText(next.text);
    setPicked((current) => [...current, candidate]);
    setMention(null);
    element.focus();
  };

  const submit = async () => {
    const body = text.trim();
    if (!body || sending) {
      return;
    }
    setSending(true);
    const sent = await onSubmit({ body, mentionedUserIds: mentionedIds(body, picked) });
    setSending(false);
    if (sent) {
      setText('');
      setPicked([]);
    }
  };

  return (
    <div className="relative grid gap-2">
      <Textarea
        ref={input}
        autoFocus={autoFocus}
        value={text}
        maxLength={MAX_COMMENT_LENGTH}
        placeholder={placeholder}
        aria-label={placeholder}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        className="min-h-20 text-sm"
        onChange={(event) => track(event.target.value, event.target.selectionStart)}
        onKeyDown={(event) => {
          if (open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            event.preventDefault();
            const step = event.key === 'ArrowDown' ? 1 : -1;
            setHighlighted((index) => (index + step + options.length) % options.length);
          } else if (open && (event.key === 'Enter' || event.key === 'Tab')) {
            event.preventDefault();
            pick(options[highlighted]);
          } else if (open && event.key === 'Escape') {
            event.preventDefault();
            setMention(null);
          } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            void submit();
          }
        }}
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="People to mention"
          className="bg-popover absolute top-full left-0 z-20 mt-1 w-56 rounded-md border p-1 shadow-md"
        >
          {options.map((candidate, index) => (
            <li
              key={candidate.id}
              role="option"
              aria-selected={index === highlighted}
              className={cn(
                'cursor-pointer rounded px-2 py-1 text-sm',
                index === highlighted && 'bg-accent',
              )}
              onMouseDown={(event) => {
                event.preventDefault();
                pick(candidate);
              }}
            >
              {candidate.name}
            </li>
          ))}
        </ul>
      )}
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="button" size="sm" disabled={!text.trim() || sending} onClick={submit}>
          {sending ? 'Sending…' : submitLabel}
        </Button>
      </div>
    </div>
  );
}
