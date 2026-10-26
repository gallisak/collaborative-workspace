import { activeMention, insertMention, matchCandidates, mentionedIds } from './mentions';

describe('activeMention', () => {
  it('detects a mention being typed at the caret', () => {
    expect(activeMention('Hi @bo', 6)).toEqual({ query: 'bo', start: 3 });
    expect(activeMention('@', 1)).toEqual({ query: '', start: 0 });
    expect(activeMention('Привіт @Бо', 10)).toEqual({ query: 'Бо', start: 7 });
  });

  it('ignores emails and finished words', () => {
    expect(activeMention('mail ann@example.com', 20)).toBeNull();
    expect(activeMention('Hi @bob there', 13)).toBeNull();
  });
});

describe('insertMention', () => {
  it('replaces the typed query with the full name and moves the caret after it', () => {
    const mention = activeMention('Ping @bo now', 8)!;
    expect(insertMention('Ping @bo now', mention, 8, 'Bob Guest')).toEqual({
      text: 'Ping @Bob Guest  now',
      caret: 16,
    });
  });
});

describe('matchCandidates', () => {
  const people = [
    { id: '1', name: 'Ann Owner' },
    { id: '2', name: 'Bob Guest' },
    { id: '3', name: 'Annabel' },
  ];

  it('matches any part of the name ignoring case', () => {
    expect(matchCandidates(people, 'ann').map((p) => p.id)).toEqual(['1', '3']);
    expect(matchCandidates(people, 'GUE').map((p) => p.id)).toEqual(['2']);
    expect(matchCandidates(people, '', 2)).toHaveLength(2);
  });
});

describe('mentionedIds', () => {
  it('keeps only people still mentioned in the final text', () => {
    const picked = [
      { id: '1', name: 'Ann Owner' },
      { id: '2', name: 'Bob Guest' },
      { id: '1', name: 'Ann Owner' },
    ];
    expect(mentionedIds('Thanks @Ann Owner!', picked)).toEqual(['1']);
    expect(mentionedIds('No mentions', picked)).toEqual([]);
  });
});
