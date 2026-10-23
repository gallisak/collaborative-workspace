import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import { Awareness, encodeAwarenessUpdate } from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';
import { handleSyncMessage, MESSAGE_SYNC, sanitizeAwarenessUpdate } from './protocol.js';

const syncMessage = (write: (encoder: encoding.Encoder) => void) => {
  const encoder = encoding.createEncoder();
  write(encoder);
  return decoding.createDecoder(encoding.toUint8Array(encoder));
};

const editFrom = (text: string) => {
  const doc = new Y.Doc();
  doc.getText('body').insert(0, text);
  return Y.encodeStateAsUpdate(doc);
};

describe('handleSyncMessage', () => {
  it('answers sync step 1 with the missing part of the server document', () => {
    const server = new Y.Doc();
    server.getText('body').insert(0, 'server text');
    const client = new Y.Doc();

    const outcome = handleSyncMessage(
      syncMessage((e) => syncProtocol.writeSyncStep1(e, client)),
      server,
      null,
      false,
    );

    expect(outcome.kind).toBe('reply');
    const reply = decoding.createDecoder((outcome as { message: Uint8Array }).message);
    expect(decoding.readVarUint(reply)).toBe(MESSAGE_SYNC);
    syncProtocol.readSyncMessage(reply, encoding.createEncoder(), client, null);
    expect(client.getText('body').toJSON()).toBe('server text');
  });

  it('applies updates from collaborators who can write', () => {
    const server = new Y.Doc();

    const outcome = handleSyncMessage(
      syncMessage((e) => syncProtocol.writeUpdate(e, editFrom('edit'))),
      server,
      null,
      true,
    );

    expect(outcome).toEqual({ kind: 'applied' });
    expect(server.getText('body').toJSON()).toBe('edit');
  });

  it('drops updates from read-only collaborators', () => {
    const server = new Y.Doc();

    const update = handleSyncMessage(
      syncMessage((e) => syncProtocol.writeUpdate(e, editFrom('hack'))),
      server,
      null,
      false,
    );
    const step2 = handleSyncMessage(
      syncMessage((e) => {
        encoding.writeVarUint(e, syncProtocol.messageYjsSyncStep2);
        encoding.writeVarUint8Array(e, editFrom('hack'));
      }),
      server,
      null,
      false,
    );

    expect(update).toEqual({ kind: 'rejected', initialSync: false });
    expect(step2).toEqual({ kind: 'rejected', initialSync: true });
    expect(server.getText('body').toJSON()).toBe('');
  });

  it('rejects unknown sync message types', () => {
    expect(() =>
      handleSyncMessage(
        syncMessage((e) => encoding.writeVarUint(e, 9)),
        new Y.Doc(),
        null,
        true,
      ),
    ).toThrow(/Unknown sync message type/);
  });
});

describe('sanitizeAwarenessUpdate', () => {
  const user = { id: 'user-1', name: 'Ann' };
  const updateFor = (state: Record<string, unknown>) => {
    const awareness = new Awareness(new Y.Doc());
    awareness.setLocalState(state);
    return {
      update: encodeAwarenessUpdate(awareness, [awareness.clientID]),
      id: awareness.clientID,
    };
  };
  const decodeStates = (update: Uint8Array) => {
    const decoder = decoding.createDecoder(update);
    const count = decoding.readVarUint(decoder);
    return Array.from({ length: count }, () => {
      decoding.readVarUint(decoder);
      decoding.readVarUint(decoder);
      return JSON.parse(decoding.readVarString(decoder)) as unknown;
    });
  };

  it('replaces the claimed identity with the authenticated user and keeps other fields', () => {
    const { update, id } = updateFor({
      user: { id: 'someone-else', name: 'Boss', color: '#f00' },
      cursor: { anchor: 3 },
    });

    const result = sanitizeAwarenessUpdate(update, () => true, user);

    expect(result?.clientIds).toEqual([id]);
    expect(decodeStates(result!.update)).toEqual([
      { user: { id: 'user-1', name: 'Ann', color: '#f00' }, cursor: { anchor: 3 } },
    ]);
  });

  it('refuses updates for awareness clients owned by another connection', () => {
    const { update } = updateFor({ cursor: null });

    expect(sanitizeAwarenessUpdate(update, () => false, user)).toBeNull();
  });
});
