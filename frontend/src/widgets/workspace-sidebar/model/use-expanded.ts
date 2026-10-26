'use client';

import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';

const EMPTY = '[]';
const NONE: ReadonlySet<string> = new Set();
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
  const forcedKey = forced.join(',');
  const [dismissed, setDismissed] = useState({ forcedKey, ids: NONE });
  const dismissedIds = dismissed.forcedKey === forcedKey ? dismissed.ids : NONE;

  const isExpanded = useCallback(
    (id: string) => stored.has(id) || (forcedSet.has(id) && !dismissedIds.has(id)),
    [stored, forcedSet, dismissedIds],
  );

  const toggle = useCallback(
    (id: string, open?: boolean) => {
      const expand = open ?? !isExpanded(id);
      const next = new Set(stored);
      const nextDismissed = new Set(dismissedIds);
      if (expand) {
        next.add(id);
        nextDismissed.delete(id);
      } else {
        next.delete(id);
        if (forcedSet.has(id)) {
          nextDismissed.add(id);
        }
      }
      setDismissed({ forcedKey, ids: nextDismissed });
      write(key, next);
    },
    [key, stored, isExpanded, dismissedIds, forcedSet, forcedKey],
  );

  return { isExpanded, toggle };
}
