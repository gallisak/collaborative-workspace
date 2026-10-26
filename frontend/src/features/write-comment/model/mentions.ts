export interface MentionCandidate {
  id: string;
  name: string;
}

export interface ActiveMention {
  query: string;
  start: number;
}

const MENTION_AT_CARET = /(^|\s)@([\p{L}\p{N}_.-]{0,30})$/u;

export function activeMention(text: string, caret: number): ActiveMention | null {
  const match = MENTION_AT_CARET.exec(text.slice(0, caret));
  if (!match) {
    return null;
  }
  return { query: match[2], start: caret - match[2].length - 1 };
}

export function insertMention(text: string, mention: ActiveMention, caret: number, name: string) {
  const inserted = `@${name} `;
  return {
    text: `${text.slice(0, mention.start)}${inserted}${text.slice(caret)}`,
    caret: mention.start + inserted.length,
  };
}

export function matchCandidates(candidates: readonly MentionCandidate[], query: string, limit = 6) {
  const needle = query.toLocaleLowerCase();
  return candidates
    .filter((candidate) => candidate.name.toLocaleLowerCase().includes(needle))
    .slice(0, limit);
}

export function mentionedIds(text: string, picked: readonly MentionCandidate[]): string[] {
  return [...new Set(picked.filter(({ name }) => text.includes(`@${name}`)).map(({ id }) => id))];
}
