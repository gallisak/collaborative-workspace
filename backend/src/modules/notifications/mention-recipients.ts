import { canView, type DocumentAccess } from '../permissions/document-access.js';

export const mentionDedupeKey = (commentId: string, userId: string) =>
  `mention:${commentId}:${userId}`;

export function mentionRecipients(
  authorId: string | null,
  mentions: readonly { userId: string; access: DocumentAccess }[],
): string[] {
  return mentions
    .filter(({ userId, access }) => userId !== authorId && canView(access))
    .map(({ userId }) => userId);
}
