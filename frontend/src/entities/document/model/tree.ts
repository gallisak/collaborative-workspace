import { generateKeyBetween } from 'fractional-indexing';
import type { DocumentNode } from '@/shared/api';

export interface FlatNode extends DocumentNode {
  depth: number;
  hasChildren: boolean;
}

export interface Placement {
  parentId: string | null;
  afterId: string | null;
}

const byPosition = (a: DocumentNode, b: DocumentNode) =>
  a.position < b.position ? -1 : a.position > b.position ? 1 : 0;

export function childrenByParent(nodes: readonly DocumentNode[]) {
  const children = new Map<string | null, DocumentNode[]>();
  for (const node of nodes) {
    const siblings = children.get(node.parentId) ?? [];
    siblings.push(node);
    children.set(node.parentId, siblings);
  }
  for (const siblings of children.values()) {
    siblings.sort(byPosition);
  }
  return children;
}

export function flattenTree(
  nodes: readonly DocumentNode[],
  isExpanded: (id: string) => boolean,
  hiddenId?: string,
): FlatNode[] {
  const children = childrenByParent(nodes);
  const flat: FlatNode[] = [];
  const visit = (parentId: string | null, depth: number) => {
    for (const node of children.get(parentId) ?? []) {
      const hasChildren = (children.get(node.id)?.length ?? 0) > 0;
      flat.push({ ...node, depth, hasChildren });
      if (hasChildren && node.id !== hiddenId && isExpanded(node.id)) {
        visit(node.id, depth + 1);
      }
    }
  };
  visit(null, 0);
  return flat;
}

export function ancestorsOf(nodes: readonly DocumentNode[], id: string): string[] {
  const parents = new Map(nodes.map((node) => [node.id, node.parentId]));
  const ancestors: string[] = [];
  let current = parents.get(id) ?? null;
  while (current && !ancestors.includes(current)) {
    ancestors.push(current);
    current = parents.get(current) ?? null;
  }
  return ancestors;
}

export function descendantsOf(nodes: readonly DocumentNode[], id: string): Set<string> {
  const children = childrenByParent(nodes);
  const result = new Set<string>();
  const stack = [id];
  while (stack.length > 0) {
    for (const child of children.get(stack.pop()!) ?? []) {
      result.add(child.id);
      stack.push(child.id);
    }
  }
  return result;
}

function arrayMove<T>(items: readonly T[], from: number, to: number): T[] {
  const copy = [...items];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

export interface Projection extends Placement {
  depth: number;
}

export function projectDrop(
  flat: readonly FlatNode[],
  activeId: string,
  overId: string,
  depthDelta: number,
): Projection | null {
  const activeIndex = flat.findIndex((node) => node.id === activeId);
  const overIndex = flat.findIndex((node) => node.id === overId);
  if (activeIndex < 0 || overIndex < 0) {
    return null;
  }
  const moved = arrayMove(flat, activeIndex, overIndex);
  const previous = moved[overIndex - 1];
  const next = moved[overIndex + 1];
  const maxDepth = previous ? previous.depth + 1 : 0;
  const minDepth = next ? next.depth : 0;
  const depth = Math.min(Math.max(flat[activeIndex].depth + depthDelta, minDepth), maxDepth);

  let parentId: string | null = null;
  if (depth > 0 && previous) {
    if (depth === previous.depth) {
      parentId = previous.parentId;
    } else if (depth > previous.depth) {
      parentId = previous.id;
    } else {
      parentId =
        moved
          .slice(0, overIndex)
          .reverse()
          .find((node) => node.depth === depth)?.parentId ?? null;
    }
  }

  let afterId: string | null = null;
  for (let i = overIndex - 1; i >= 0; i--) {
    if (moved[i].depth < depth) {
      break;
    }
    if (moved[i].depth === depth && moved[i].parentId === parentId) {
      afterId = moved[i].id;
      break;
    }
  }
  return { depth, parentId, afterId };
}

export function moveNode(
  nodes: readonly DocumentNode[],
  id: string,
  { parentId, afterId }: Placement,
): DocumentNode[] {
  const siblings = (childrenByParent(nodes).get(parentId) ?? []).filter((node) => node.id !== id);
  const afterIndex = afterId === null ? -1 : siblings.findIndex((node) => node.id === afterId);
  const before = afterIndex >= 0 ? siblings[afterIndex].position : null;
  const after = siblings[afterIndex + 1]?.position ?? null;
  const position = generateKeyBetween(before, after);
  return nodes.map((node) => (node.id === id ? { ...node, parentId, position } : node));
}

export function isNoopMove(nodes: readonly DocumentNode[], id: string, placement: Placement) {
  const node = nodes.find((item) => item.id === id);
  if (!node || node.parentId !== placement.parentId) {
    return false;
  }
  const siblings = childrenByParent(nodes).get(node.parentId) ?? [];
  const index = siblings.findIndex((item) => item.id === id);
  return (siblings[index - 1]?.id ?? null) === placement.afterId;
}
