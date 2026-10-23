import { mentionDedupeKey, mentionRecipients } from './mention-recipients.js';

describe('mentionRecipients', () => {
  it('notifies mentioned users who can still see the document', () => {
    expect(
      mentionRecipients('author', [
        { userId: 'viewer', access: 'VIEW' },
        { userId: 'editor', access: 'EDIT' },
        { userId: 'revoked', access: 'NONE' },
      ]),
    ).toEqual(['viewer', 'editor']);
  });

  it('never notifies the author about their own mention', () => {
    expect(mentionRecipients('author', [{ userId: 'author', access: 'MANAGE' }])).toEqual([]);
  });

  it('notifies everyone when the author account is gone', () => {
    expect(mentionRecipients(null, [{ userId: 'viewer', access: 'VIEW' }])).toEqual(['viewer']);
  });
});

describe('mentionDedupeKey', () => {
  it('is stable per comment and recipient', () => {
    expect(mentionDedupeKey('c1', 'u1')).toBe(mentionDedupeKey('c1', 'u1'));
    expect(mentionDedupeKey('c1', 'u1')).not.toBe(mentionDedupeKey('c1', 'u2'));
  });
});
