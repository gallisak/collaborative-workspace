'use client';

import { useEffect, useSyncExternalStore } from 'react';
import {
  acquireSession,
  type CollabSession,
  type SessionSnapshot,
  sessionFor,
  subscribeSessions,
} from './collab-session';

const CONNECTING: SessionSnapshot = { state: 'connecting', synced: false };
const noopSubscribe = () => () => {};

export function useCollabSession(documentId: string): CollabSession | null {
  useEffect(() => acquireSession(documentId), [documentId]);
  return useSyncExternalStore(
    subscribeSessions,
    () => sessionFor(documentId),
    () => null,
  );
}

export function useSessionSnapshot(session: CollabSession | null): SessionSnapshot {
  return useSyncExternalStore(
    session?.subscribe ?? noopSubscribe,
    session?.getSnapshot ?? (() => CONNECTING),
    () => CONNECTING,
  );
}
