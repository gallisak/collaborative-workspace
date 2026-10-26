import type { DocumentNode } from '@/shared/api';
import { ancestorsOf, descendantsOf, flattenTree, isNoopMove, moveNode, projectDrop } from './tree';

const node = (id: string, parentId: string | null, position: string): DocumentNode => ({
  id,
  parentId,
  position,
  title: id,
});

const nodes = [
  node('b', null, 'a1'),
  node('a', null, 'a0'),
  node('a1', 'a', 'a0'),
  node('a2', 'a', 'a1'),
  node('a2x', 'a2', 'a0'),
  node('c', null, 'a2'),
];

const all = () => true;
const ids = (flat: { id: string; depth: number }[]) => flat.map((n) => `${n.id}:${n.depth}`);

describe('flattenTree', () => {
  it('lists nodes depth first in position order', () => {
    expect(ids(flattenTree(nodes, all))).toEqual(['a:0', 'a1:1', 'a2:1', 'a2x:2', 'b:0', 'c:0']);
  });

  it('skips children of collapsed nodes and of the dragged node', () => {
    expect(ids(flattenTree(nodes, (id) => id !== 'a'))).toEqual(['a:0', 'b:0', 'c:0']);
    expect(ids(flattenTree(nodes, all, 'a2'))).toEqual(['a:0', 'a1:1', 'a2:1', 'b:0', 'c:0']);
  });

  it('marks nodes that have children', () => {
    const flat = flattenTree(nodes, all);
    expect(flat.find((n) => n.id === 'a2')?.hasChildren).toBe(true);
    expect(flat.find((n) => n.id === 'a1')?.hasChildren).toBe(false);
  });
});

describe('tree relations', () => {
  it('finds ancestors from the closest one', () => {
    expect(ancestorsOf(nodes, 'a2x')).toEqual(['a2', 'a']);
    expect(ancestorsOf(nodes, 'a')).toEqual([]);
  });

  it('finds all descendants', () => {
    expect([...descendantsOf(nodes, 'a')].sort()).toEqual(['a1', 'a2', 'a2x']);
  });
});

describe('projectDrop', () => {
  const flat = flattenTree(nodes, all, 'c');

  it('reorders among root pages', () => {
    expect(projectDrop(flat, 'c', 'b', 0)).toEqual({ depth: 0, parentId: null, afterId: 'a' });
    expect(projectDrop(flat, 'c', 'a', 0)).toEqual({ depth: 0, parentId: null, afterId: null });
  });

  it('nests under the previous page when dragged to the right', () => {
    expect(projectDrop(flat, 'c', 'c', 1)).toEqual({ depth: 1, parentId: 'b', afterId: null });
  });

  it('cannot nest deeper than one level below the previous page', () => {
    expect(projectDrop(flat, 'c', 'c', 5)).toEqual({ depth: 1, parentId: 'b', afterId: null });
  });

  it('places a page after a sibling inside a nested list', () => {
    const tree = flattenTree(nodes, all, 'a1');
    expect(projectDrop(tree, 'a1', 'a2x', 0)).toEqual({ depth: 1, parentId: 'a', afterId: 'a2' });
    expect(projectDrop(tree, 'a1', 'a2x', 1)).toEqual({
      depth: 2,
      parentId: 'a2',
      afterId: 'a2x',
    });
  });

  it('never splits a page from its children', () => {
    const tree = flattenTree(nodes, all, 'b');
    expect(projectDrop(tree, 'b', 'a2x', -1)).toEqual({ depth: 2, parentId: 'a2', afterId: null });
  });

  it('moves a nested page back to the root', () => {
    const tree = flattenTree(nodes, all, 'a1');
    expect(projectDrop(tree, 'a1', 'c', -1)).toEqual({ depth: 0, parentId: null, afterId: 'c' });
  });
});

describe('moveNode', () => {
  const order = (list: DocumentNode[], parentId: string | null) =>
    flattenTree(list, all)
      .filter((n) => n.parentId === parentId)
      .map((n) => n.id);

  it('puts a page first, last or after a sibling with a valid position', () => {
    expect(order(moveNode(nodes, 'c', { parentId: null, afterId: null }), null)).toEqual([
      'c',
      'a',
      'b',
    ]);
    expect(order(moveNode(nodes, 'a', { parentId: null, afterId: 'c' }), null)).toEqual([
      'b',
      'c',
      'a',
    ]);
    expect(order(moveNode(nodes, 'c', { parentId: 'a', afterId: 'a1' }), 'a')).toEqual([
      'a1',
      'c',
      'a2',
    ]);
  });

  it('recognizes moves that change nothing', () => {
    expect(isNoopMove(nodes, 'b', { parentId: null, afterId: 'a' })).toBe(true);
    expect(isNoopMove(nodes, 'b', { parentId: null, afterId: null })).toBe(false);
    expect(isNoopMove(nodes, 'a1', { parentId: null, afterId: 'a' })).toBe(false);
  });
});
