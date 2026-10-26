'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';

const EMPTY = '[]';
const memory = new Map<string, string>();
const listeners = new Set<() => void>();

const storageKey = (workspaceId: string) => `collab-docs:expanded:${workspaceId}`;

function read(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? memory.get(key) ?? EMPTY;
  } catch {
    return memory.get(key) ?? EMPTY;
  }
}

function write(key: string, ids: Iterable<string>) {
  const value = JSON.stringify([...ids]);
  memory.set(key, value);
  try {
    window.localStorage.setItem(key, value);
  } catch {}
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

function parse(raw: string): Set<string> {
  try {
    const ids: unknown = JSON.parse(raw);
    return new Set(Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

export function useExpanded(workspaceId: string, forced: readonly string[]) {
  const key = storageKey(workspaceId);
  const raw = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => EMPTY,
  );
  const stored = useMemo(() => parse(raw), [raw]);
  const forcedSet = useMemo(() => new Set(forced), [forced]);

  const isExpanded = useCallback(
    (id: string) => stored.has(id) || forcedSet.has(id),
    [stored, forcedSet],
  );

  const toggle = useCallback(
    (id: string, open?: boolean) => {
      const next = new Set(stored);
      if (open ?? !isExpanded(id)) {
        next.add(id);
      } else {
        next.delete(id);
      }
      write(key, next);
    },
    [key, stored, isExpanded],
  );

  return { isExpanded, toggle };
}
