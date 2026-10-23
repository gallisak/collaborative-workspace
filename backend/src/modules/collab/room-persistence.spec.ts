import * as Y from 'yjs';
import type { DocumentStore, StoredDocument } from './document-store.js';
import { RoomPersistence } from './room-persistence.js';

class FakeStore {
  appended: Uint8Array[] = [];
  snapshots: { state: Uint8Array; upTo: bigint }[] = [];
  failNextAppend = false;
  private nextId = 0n;

  append(_documentId: string, data: Uint8Array) {
    if (this.failNextAppend) {
      this.failNextAppend = false;
      return Promise.reject(new Error('db down'));
    }
    this.appended.push(data);
    return Promise.resolve(++this.nextId);
  }

  compact(_documentId: string, state: Uint8Array, upTo: bigint) {
    this.snapshots.push({ state, upTo });
    return Promise.resolve();
  }
}

const empty: StoredDocument = { state: null, snapshotUpdateId: 0n, updates: [] };

const setup = (compactionThreshold = 100) => {
  const doc = new Y.Doc();
  const store = new FakeStore();
  const persistence = new RoomPersistence(
    'doc-1',
    doc,
    store as unknown as DocumentStore,
    { flushIntervalMs: 20, compactionThreshold },
    empty,
    () => undefined,
  );
  doc.on('update', (update: Uint8Array) => persistence.record(update));
  return { doc, store, persistence };
};

const restore = (updates: Uint8Array[]) => {
  const doc = new Y.Doc();
  updates.forEach((update) => Y.applyUpdate(doc, update));
  return doc.getText('body').toJSON();
};

describe('RoomPersistence', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('batches updates received within the flush interval into one write', async () => {
    const { doc, store } = setup();
    doc.getText('body').insert(0, 'a');
    doc.getText('body').insert(1, 'b');
    doc.getText('body').insert(2, 'c');

    expect(store.appended).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(20);

    expect(store.appended).toHaveLength(1);
    expect(restore(store.appended)).toBe('abc');
  });

  it('compacts into a snapshot after the configured number of writes', async () => {
    const { doc, store } = setup(2);
    doc.getText('body').insert(0, 'one');
    await vi.advanceTimersByTimeAsync(20);
    doc.getText('body').insert(3, ' two');
    await vi.advanceTimersByTimeAsync(20);

    expect(store.snapshots).toHaveLength(1);
    expect(store.snapshots[0].upTo).toBe(2n);
    expect(restore([store.snapshots[0].state])).toBe('one two');
  });

  it('writes pending changes and a snapshot when the room closes', async () => {
    const { doc, store, persistence } = setup();
    doc.getText('body').insert(0, 'unsaved');

    await persistence.flushAndCompact();

    expect(store.appended).toHaveLength(1);
    expect(restore([store.snapshots[0].state])).toBe('unsaved');
  });

  it('keeps changes for the next attempt when a write fails', async () => {
    const { doc, store, persistence } = setup();
    store.failNextAppend = true;
    doc.getText('body').insert(0, 'kept');

    await vi.advanceTimersByTimeAsync(20);
    expect(store.appended).toHaveLength(0);

    await persistence.flush();
    expect(restore(store.appended)).toBe('kept');
  });

  it('skips the snapshot when nothing changed since the last one', async () => {
    const { store, persistence } = setup();

    await persistence.flushAndCompact();

    expect(store.appended).toHaveLength(0);
    expect(store.snapshots).toHaveLength(0);
  });
});
