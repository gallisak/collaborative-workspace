'use client';

import { type Editor, useEditorState } from '@tiptap/react';
import {
  Bold,
  MessageSquarePlus,
  Code,
  Italic,
  List,
  ListChecks,
  ListOrdered,
  Redo2,
  SquareCode,
  Strikethrough,
  Undo2,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { ImageButton } from '@/features/insert-image';
import { Button } from '@/shared/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { blockAtSelection } from '../model/comment-highlight';
import { LinkButton } from './LinkButton';

const BLOCKS = [
  { value: 'paragraph', label: 'Text' },
  { value: 'h1', label: 'Heading 1' },
  { value: 'h2', label: 'Heading 2' },
  { value: 'h3', label: 'Heading 3' },
] as const;

type BlockValue = (typeof BLOCKS)[number]['value'];

function ToolButton({
  label,
  active = false,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      className={active ? 'bg-accent' : undefined}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

interface EditorToolbarProps {
  editor: Editor;
  disabled: boolean;
  imageDocumentId?: string;
  onComment?: (blockId: string) => void;
}

export function EditorToolbar({
  editor,
  disabled,
  imageDocumentId,
  onComment,
}: EditorToolbarProps) {
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      block: (current.isActive('heading', { level: 1 })
        ? 'h1'
        : current.isActive('heading', { level: 2 })
          ? 'h2'
          : current.isActive('heading', { level: 3 })
            ? 'h3'
            : 'paragraph') as BlockValue,
      bold: current.isActive('bold'),
      italic: current.isActive('italic'),
      strike: current.isActive('strike'),
      code: current.isActive('code'),
      link: current.isActive('link'),
      bulletList: current.isActive('bulletList'),
      orderedList: current.isActive('orderedList'),
      taskList: current.isActive('taskList'),
      codeBlock: current.isActive('codeBlock'),
      canUndo: current.can().undo(),
      canRedo: current.can().redo(),
    }),
  });
  const run = () => editor.chain().focus();

  const setBlock = (value: BlockValue) => {
    if (value === 'paragraph') {
      run().setParagraph().run();
    } else {
      run()
        .setHeading({ level: Number(value.slice(1)) as 1 | 2 | 3 })
        .run();
    }
  };

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="bg-background/95 sticky top-0 z-10 flex flex-wrap items-center gap-0.5 border-b py-1.5 backdrop-blur"
    >
      <Select value={state.block} onValueChange={setBlock} disabled={disabled}>
        <SelectTrigger size="sm" className="w-32" aria-label="Block type">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {BLOCKS.map((block) => (
            <SelectItem key={block.value} value={block.value}>
              {block.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="bg-border mx-1 h-5 w-px" />
      <ToolButton
        label="Bold"
        active={state.bold}
        disabled={disabled}
        onClick={() => run().toggleBold().run()}
      >
        <Bold />
      </ToolButton>
      <ToolButton
        label="Italic"
        active={state.italic}
        disabled={disabled}
        onClick={() => run().toggleItalic().run()}
      >
        <Italic />
      </ToolButton>
      <ToolButton
        label="Strikethrough"
        active={state.strike}
        disabled={disabled}
        onClick={() => run().toggleStrike().run()}
      >
        <Strikethrough />
      </ToolButton>
      <ToolButton
        label="Inline code"
        active={state.code}
        disabled={disabled}
        onClick={() => run().toggleCode().run()}
      >
        <Code />
      </ToolButton>
      <LinkButton editor={editor} active={state.link} disabled={disabled} />
      <span className="bg-border mx-1 h-5 w-px" />
      <ToolButton
        label="Bulleted list"
        active={state.bulletList}
        disabled={disabled}
        onClick={() => run().toggleBulletList().run()}
      >
        <List />
      </ToolButton>
      <ToolButton
        label="Numbered list"
        active={state.orderedList}
        disabled={disabled}
        onClick={() => run().toggleOrderedList().run()}
      >
        <ListOrdered />
      </ToolButton>
      <ToolButton
        label="Checklist"
        active={state.taskList}
        disabled={disabled}
        onClick={() => run().toggleTaskList().run()}
      >
        <ListChecks />
      </ToolButton>
      <ToolButton
        label="Code block"
        active={state.codeBlock}
        disabled={disabled}
        onClick={() => run().toggleCodeBlock().run()}
      >
        <SquareCode />
      </ToolButton>
      {imageDocumentId && (
        <ImageButton editor={editor} documentId={imageDocumentId} disabled={disabled} />
      )}
      <span className="bg-border mx-1 h-5 w-px" />
      <ToolButton
        label="Undo"
        disabled={disabled || !state.canUndo}
        onClick={() => run().undo().run()}
      >
        <Undo2 />
      </ToolButton>
      <ToolButton
        label="Redo"
        disabled={disabled || !state.canRedo}
        onClick={() => run().redo().run()}
      >
        <Redo2 />
      </ToolButton>
      {onComment && (
        <>
          <span className="bg-border mx-1 h-5 w-px" />
          <ToolButton
            label="Comment on block"
            disabled={disabled}
            onClick={() => {
              const blockId = blockAtSelection(editor);
              if (blockId) {
                onComment(blockId);
              } else {
                toast.info('Place the cursor in a paragraph, heading, code block or image');
              }
            }}
          >
            <MessageSquarePlus />
          </ToolButton>
        </>
      )}
    </div>
  );
}
