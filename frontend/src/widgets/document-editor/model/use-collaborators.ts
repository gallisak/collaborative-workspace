'use client';

import { useMemo, useSyncExternalStore } from 'react';
import type { CollabSession } from './collab-session';

export function useCollaborators(session: CollabSession, selfId: string) {
  const people = useSyncExternalStore(
    session.subscribePeople,
    session.getPeople,
    session.getPeople,
  );
  return useMemo(() => people.filter((person) => person.id !== selfId), [people, selfId]);
}
