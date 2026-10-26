'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronRight, FileText, GripVertical, MoreHorizontal, Plus } from 'lucide-react';
import Link from 'next/link';
import { displayTitle, type FlatNode } from '@/entities/document';
import { RenameInput } from '@/features/rename-document';
import { routes } from '@/shared/config';
import { cn } from '@/shared/lib';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';

export const INDENT_PX = 16;

interface TreeItemProps {
  node: FlatNode;
  depth: number;
  workspaceId: string;
  active: boolean;
  expanded: boolean;
  editable: boolean;
  renaming: boolean;
  onToggle: () => void;
  onAddChild: () => void;
  onRename: (renaming: boolean) => void;
  onDelete: () => void;
}

export function TreeItem({
  node,
  depth,
  workspaceId,
  active,
  expanded,
  editable,
  renaming,
  onToggle,
  onAddChild,
  onRename,
  onDelete,
}: TreeItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: node.id, disabled: !editable || renaming });
  const title = displayTitle(node.title);

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn('list-none', isDragging && 'opacity-40')}
      role="treeitem"
      aria-level={depth + 1}
      aria-expanded={node.hasChildren ? expanded : undefined}
      aria-selected={active}
    >
      <div
        className={cn(
          'group hover:bg-sidebar-accent flex h-8 items-center gap-0.5 rounded-md pr-1 text-sm',
          active && 'bg-sidebar-accent text-sidebar-accent-foreground font-medium',
        )}
        style={{ paddingLeft: depth * INDENT_PX + 4 }}
      >
        {editable && (
          <button
            ref={setActivatorNodeRef}
            type="button"
            aria-label={`Move ${title}`}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring -ml-1 flex size-5 shrink-0 cursor-grab items-center justify-center rounded opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-3.5" />
          </button>
        )}
        <button
          type="button"
          aria-label={expanded ? `Collapse ${title}` : `Expand ${title}`}
          className={cn(
            'text-muted-foreground hover:bg-sidebar-border flex size-5 shrink-0 items-center justify-center rounded',
            !node.hasChildren && 'invisible',
          )}
          onClick={onToggle}
          tabIndex={node.hasChildren ? 0 : -1}
        >
          <ChevronRight className={cn('size-3.5 transition-transform', expanded && 'rotate-90')} />
        </button>
        {renaming ? (
          <RenameInput documentId={node.id} title={node.title} onDone={() => onRename(false)} />
        ) : (
          <Link
            href={routes.document(workspaceId, node.id)}
            aria-current={active ? 'page' : undefined}
            className="flex min-w-0 flex-1 items-center gap-1.5 truncate py-1"
          >
            <FileText className="text-muted-foreground size-4 shrink-0" />
            <span className={cn('truncate', !node.title.trim() && 'text-muted-foreground')}>
              {title}
            </span>
          </Link>
        )}
        {editable && !renaming && (
          <div className="flex shrink-0 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-xs" aria-label={`Actions for ${title}`}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onSelect={() => onRename(true)}>Rename</DropdownMenuItem>
                <DropdownMenuItem onSelect={onAddChild}>Add subpage</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Add a page inside ${title}`}
              onClick={onAddChild}
            >
              <Plus />
            </Button>
          </div>
        )}
      </div>
    </li>
  );
}
