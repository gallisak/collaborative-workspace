import * as Y from 'yjs';

const capture = (doc: Y.Doc) => {
  const updates: Uint8Array[] = [];
  doc.on('update', (update: Uint8Array) => updates.push(update));
  return updates;
};

const replay = (updates: Uint8Array[]) => {
  const doc = new Y.Doc();
  for (const update of updates) {
    Y.applyUpdate(doc, update);
  }
  return doc;
};

describe('CRDT merge', () => {
  it('keeps both concurrent edits of the same text without losing changes', () => {
    const base = new Y.Doc();
    base.getText('body').insert(0, 'Hello world');
    const initial = Y.encodeStateAsUpdate(base);

    const alice = replay([initial]);
    const bob = replay([initial]);
    const fromAlice = capture(alice);
    const fromBob = capture(bob);

    alice.getText('body').insert(5, ', dear');
    bob.getText('body').insert(11, '!');
    bob.getText('body').delete(0, 1);
    bob.getText('body').insert(0, 'h');

    fromBob.forEach((update) => Y.applyUpdate(alice, update));
    fromAlice.forEach((update) => Y.applyUpdate(bob, update));

    expect(alice.getText('body').toJSON()).toBe('hello, dear world!');
    expect(bob.getText('body').toJSON()).toBe(alice.getText('body').toJSON());
  });

  it('converges regardless of the order updates arrive in', () => {
    const writers = [new Y.Doc(), new Y.Doc(), new Y.Doc()];
    const updates = writers.flatMap((doc, i) => {
      const captured = capture(doc);
      doc.getArray<string>('blocks').push([`block ${i}`]);
      doc.getMap('meta').set('lastEditor', i);
      return captured;
    });

    const forward = replay(updates);
    const backward = replay([...updates].reverse());

    expect(forward.getArray('blocks').toArray()).toEqual(backward.getArray('blocks').toArray());
    expect(forward.getArray('blocks').length).toBe(3);
    expect(forward.getMap('meta').get('lastEditor')).toBe(
      backward.getMap('meta').get('lastEditor'),
    );
  });

  it('ignores a duplicated delivery of the same update', () => {
    const source = new Y.Doc();
    const updates = capture(source);
    source.getText('body').insert(0, 'once');

    const target = replay([updates[0], updates[0], updates[0]]);

    expect(target.getText('body').toJSON()).toBe('once');
  });

  it('restores the same document from a snapshot plus later updates', () => {
    const live = new Y.Doc();
    live.getText('body').insert(0, 'snapshot');
    const snapshot = Y.encodeStateAsUpdate(live);
    const later = capture(live);
    live.getText('body').insert(8, ' and more');

    const restored = replay([snapshot, Y.mergeUpdates(later)]);

    expect(restored.getText('body').toJSON()).toBe('snapshot and more');
  });
});
