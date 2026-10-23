import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import type { Awareness } from 'y-protocols/awareness';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import type * as Y from 'yjs';

export const MESSAGE_SYNC = 0;
export const MESSAGE_AWARENESS = 1;
export const MESSAGE_QUERY_AWARENESS = 3;

export const CloseCode = {
  BadRequest: 4400,
  Unauthorized: 4401,
  Forbidden: 4403,
  NotFound: 4404,
  ServerRestart: 1012,
} as const;

export type SyncOutcome =
  | { kind: 'reply'; message: Uint8Array }
  | { kind: 'applied' }
  | { kind: 'rejected'; initialSync: boolean };

export function handleSyncMessage(
  decoder: decoding.Decoder,
  doc: Y.Doc,
  origin: unknown,
  canWrite: boolean,
): SyncOutcome {
  const type = decoding.readVarUint(decoder);
  switch (type) {
    case syncProtocol.messageYjsSyncStep1: {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.readSyncStep1(decoder, encoder, doc);
      return { kind: 'reply', message: encoding.toUint8Array(encoder) };
    }
    case syncProtocol.messageYjsSyncStep2:
    case syncProtocol.messageYjsUpdate: {
      if (!canWrite) {
        decoding.readVarUint8Array(decoder);
        return { kind: 'rejected', initialSync: type === syncProtocol.messageYjsSyncStep2 };
      }
      syncProtocol.readSyncStep2(decoder, doc, origin);
      return { kind: 'applied' };
    }
    default:
      throw new Error(`Unknown sync message type ${type}`);
  }
}

export function encodeSyncStep1(doc: Y.Doc): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_SYNC);
  syncProtocol.writeSyncStep1(encoder, doc);
  return encoding.toUint8Array(encoder);
}

export function encodeUpdate(update: Uint8Array): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_SYNC);
  syncProtocol.writeUpdate(encoder, update);
  return encoding.toUint8Array(encoder);
}

export function encodeAwareness(awareness: Awareness, clientIds: number[]): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
  encoding.writeVarUint8Array(
    encoder,
    awarenessProtocol.encodeAwarenessUpdate(awareness, clientIds),
  );
  return encoding.toUint8Array(encoder);
}

export interface PresenceUser {
  id: string;
  name: string;
}

export interface SanitizedAwareness {
  update: Uint8Array;
  clientIds: number[];
}

export function sanitizeAwarenessUpdate(
  update: Uint8Array,
  canControl: (clientId: number) => boolean,
  user: PresenceUser,
): SanitizedAwareness | null {
  const decoder = decoding.createDecoder(update);
  const encoder = encoding.createEncoder();
  const count = decoding.readVarUint(decoder);
  const clientIds: number[] = [];
  encoding.writeVarUint(encoder, count);
  for (let i = 0; i < count; i++) {
    const clientId = decoding.readVarUint(decoder);
    const clock = decoding.readVarUint(decoder);
    const state = JSON.parse(decoding.readVarString(decoder)) as Record<string, unknown> | null;
    if (!canControl(clientId)) {
      return null;
    }
    const current = state?.user;
    const sanitized =
      state === null
        ? null
        : {
            ...state,
            user: { ...(typeof current === 'object' && current !== null ? current : {}), ...user },
          };
    encoding.writeVarUint(encoder, clientId);
    encoding.writeVarUint(encoder, clock);
    encoding.writeVarString(encoder, JSON.stringify(sanitized));
    clientIds.push(clientId);
  }
  return { update: encoding.toUint8Array(encoder), clientIds };
}
