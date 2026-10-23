import type { WebSocket } from 'ws';
import { Awareness, removeAwarenessStates } from 'y-protocols/awareness';
import * as Y from 'yjs';
import { encodeAwareness, encodeUpdate, type PresenceUser } from './protocol.js';
import type { RoomPersistence } from './room-persistence.js';

export const LOAD_ORIGIN = Symbol('load');

export interface CollabClient {
  socket: WebSocket;
  user: PresenceUser;
  canWrite: boolean;
  clientIds: Set<number>;
}

export class Room {
  readonly doc = new Y.Doc();
  readonly awareness = new Awareness(this.doc);
  readonly clients = new Map<WebSocket, CollabClient>();
  private readonly controllers = new Map<number, CollabClient>();
  readonly persistence: RoomPersistence;
  closed = false;

  constructor(
    readonly documentId: string,
    readonly workspaceId: string,
    persistenceFor: (doc: Y.Doc) => RoomPersistence,
  ) {
    this.persistence = persistenceFor(this.doc);
    this.awareness.setLocalState(null);
    this.doc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin === LOAD_ORIGIN) {
        return;
      }
      this.persistence.record(update);
      const message = encodeUpdate(update);
      for (const client of this.clients.values()) {
        if (client !== origin) {
          send(client.socket, message);
        }
      }
    });
    this.awareness.on(
      'update',
      ({ added, updated, removed }: Record<'added' | 'updated' | 'removed', number[]>) => {
        const changed = [...added, ...updated, ...removed];
        const message = encodeAwareness(this.awareness, changed);
        for (const client of this.clients.values()) {
          send(client.socket, message);
        }
      },
    );
  }

  canControl(client: CollabClient, clientId: number): boolean {
    const owner = this.controllers.get(clientId);
    return owner === undefined || owner === client;
  }

  claim(client: CollabClient, clientIds: number[]) {
    for (const clientId of clientIds) {
      this.controllers.set(clientId, client);
      client.clientIds.add(clientId);
    }
  }

  join(client: CollabClient) {
    this.clients.set(client.socket, client);
  }

  leave(client: CollabClient) {
    this.clients.delete(client.socket);
    const ids = [...client.clientIds];
    for (const id of ids) {
      this.controllers.delete(id);
    }
    removeAwarenessStates(this.awareness, ids, null);
  }

  destroy() {
    this.closed = true;
    this.awareness.destroy();
    this.doc.destroy();
  }
}

export function send(socket: WebSocket, message: Uint8Array) {
  if (socket.readyState === socket.OPEN) {
    socket.send(message);
  }
}
