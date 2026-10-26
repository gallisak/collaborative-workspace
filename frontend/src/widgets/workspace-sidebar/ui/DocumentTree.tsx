'use client';

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { FileText } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useId, useMemo, useState } from 'react';
import {
  ancestorsOf,
  displayTitle,
  flattenTree,
  projectDrop,
  useDocumentTree,
} from '@/entities/document';
import { useCreateDocument } from '@/features/create-document';
import { DeleteDocumentDialog } from '@/features/delete-document';
import { useMoveDocument } from '@/features/move-document';
import { useExpanded } from '../model/use-expanded';
import { INDENT_PX, TreeItem } from './TreeItem';

interface DragState {
  activeId: string;
  overId: string;
  offsetX: number;
}

export function DocumentTree({ editable }: { editable: boolean }) {
  const dndId = useId();
  const params = useParams<{ documentId?: string }>();
  const currentId = params?.documentId;
  const { workspaceId, nodes } = useDocumentTree();
  const move = useMoveDocument();
  const forced = useMemo(
    () => (currentId ? ancestorsOf(nodes, currentId) : []),
    [nodes, currentId],
  );
  const { isExpanded, toggle } = useExpanded(workspaceId, forced);
  const { create } = useCreateDocument((parentId) => parentId && toggle(parentId, true));
  const [drag, setDrag] = useState<DragState | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const flat = useMemo(
    () => flattenTree(nodes, isExpanded, drag?.activeId),
    [nodes, isExpanded, drag?.activeId],
  );
  const projection = drag
    ? projectDrop(flat, drag.activeId, drag.overId, Math.round(drag.offsetX / INDENT_PX))
    : null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragStart = ({ active }: DragStartEvent) =>
    setDrag({ activeId: String(active.id), overId: String(active.id), offsetX: 0 });
  const onDragMove = ({ delta }: DragMoveEvent) =>
    setDrag((current) => current && { ...current, offsetX: delta.x });
  const onDragOver = ({ over }: DragOverEvent) =>
    setDrag((current) => current && over && { ...current, overId: String(over.id) });
  const onDragEnd = ({ active }: DragEndEvent) => {
    const placement = projection;
    setDrag(null);
    if (placement) {
      if (placement.parentId) {
        toggle(placement.parentId, true);
      }
      void move(String(active.id), { parentId: placement.parentId, afterId: placement.afterId });
    }
  };

  if (nodes.length === 0) {
    return (
      <p className="text-muted-foreground px-2 py-3 text-sm">
        {editable ? 'No pages yet. Create the first one.' : 'No pages yet.'}
      </p>
    );
  }

  const dragged = drag ? nodes.find((node) => node.id === drag.activeId) : undefined;

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDrag(null)}
    >
      <SortableContext items={flat.map((node) => node.id)} strategy={verticalListSortingStrategy}>
        <ul role="tree" aria-label="Pages" className="grid gap-px">
          {flat.map((node) => (
            <TreeItem
              key={node.id}
              node={node}
              depth={node.id === drag?.activeId && projection ? projection.depth : node.depth}
              workspaceId={workspaceId}
              active={node.id === currentId}
              expanded={isExpanded(node.id)}
              editable={editable}
              renaming={renamingId === node.id}
              onToggle={() => toggle(node.id)}
              onAddChild={() => create(node.id)}
              onRename={(renaming) => setRenamingId(renaming ? node.id : null)}
              onDelete={() => setDeletingId(node.id)}
            />
          ))}
        </ul>
      </SortableContext>
      <DragOverlay dropAnimation={null}>
        {dragged && (
          <div className="bg-popover flex h-8 items-center gap-1.5 rounded-md px-2 text-sm shadow-md">
            <FileText className="text-muted-foreground size-4" />
            {displayTitle(dragged.title)}
          </div>
        )}
      </DragOverlay>
      <DeleteDocumentDialog
        documentId={deletingId}
        onOpenChange={(open) => !open && setDeletingId(null)}
      />
    </DndContext>
  );
}
