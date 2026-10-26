export const PRESENCE_COLORS = [
  '#e11d48',
  '#d97706',
  '#16a34a',
  '#0891b2',
  '#2563eb',
  '#7c3aed',
  '#c026d3',
  '#ea580c',
] as const;

export interface Collaborator {
  id: string;
  name: string;
  color: string;
}

export function colorFor(userId: string): string {
  let hash = 0;
  for (const char of userId) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return PRESENCE_COLORS[hash % PRESENCE_COLORS.length];
}

export function collaboratorsFrom(
  states: Iterable<Record<string, unknown>>,
  selfId: string,
): Collaborator[] {
  const unique = new Map<string, Collaborator>();
  for (const state of states) {
    const user = state.user as Partial<Collaborator> | undefined;
    if (user?.id && user.name && user.id !== selfId && !unique.has(user.id)) {
      unique.set(user.id, { id: user.id, name: user.name, color: user.color ?? colorFor(user.id) });
    }
  }
  return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name));
}
