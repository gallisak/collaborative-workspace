'use client';

import type { CollabSession } from '../model/collab-session';
import { useCollaborators } from '../model/use-collaborators';

const initial = (name: string) => name.trim()[0]?.toUpperCase() ?? '?';

export function Collaborators({ session, selfId }: { session: CollabSession; selfId: string }) {
  const people = useCollaborators(session, selfId);
  if (people.length === 0) {
    return null;
  }
  return (
    <ul aria-label="People editing now" className="flex -space-x-1.5">
      {people.map((person) => (
        <li
          key={person.id}
          title={person.name}
          className="ring-background flex size-7 items-center justify-center rounded-full text-xs font-medium text-white ring-2"
          style={{ backgroundColor: person.color }}
        >
          <span aria-hidden>{initial(person.name)}</span>
          <span className="sr-only">{person.name}</span>
        </li>
      ))}
    </ul>
  );
}
