import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Y from 'yjs';
import type { Env } from '../../infra/config/env.schema.js';
import { DocumentStore } from './document-store.js';
import { CloseCode } from './protocol.js';
import { type CollabClient, LOAD_ORIGIN, Room } from './room.js';
import { type PersistenceOptions, RoomPersistence } from './room-persistence.js';

@Injectable()
export class RoomsService {
  private readonly logger = new Logger(RoomsService.name);
  private readonly loading = new Map<string, Promise<Room>>();
  private readonly loaded = new Map<string, Room>();
  private readonly options: PersistenceOptions;

  constructor(
    private readonly store: DocumentStore,
    config: ConfigService<Env, true>,
  ) {
    this.options = {
      flushIntervalMs: config.get('COLLAB_FLUSH_INTERVAL_MS', { infer: true }),
      compactionThreshold: config.get('COLLAB_COMPACTION_THRESHOLD', { infer: true }),
    };
  }

  async join(documentId: string, workspaceId: string, client: CollabClient): Promise<Room> {
    for (;;) {
      const room = await this.acquire(documentId, workspaceId);
      if (!room.closed) {
        room.join(client);
        return room;
      }
    }
  }

  async release(room: Room) {
    if (room.clients.size > 0 || room.closed) {
      return;
    }
    await room.persistence.flushAndCompact();
    if (room.clients.size === 0 && this.loaded.get(room.documentId) === room) {
      this.forget(room);
      this.logger.debug({ documentId: room.documentId }, 'Room closed');
    }
  }

  inWorkspace(workspaceId: string): Room[] {
    return [...this.loaded.values()].filter((room) => room.workspaceId === workspaceId);
  }

  async closeAll() {
    await Promise.allSettled(this.loading.values());
    await Promise.all(
      [...this.loaded.values()].map(async (room) => {
        for (const client of room.clients.values()) {
          client.socket.close(CloseCode.ServerRestart, 'Server restarting');
        }
        await room.persistence.flushAndCompact();
        this.forget(room);
      }),
    );
  }

  private acquire(documentId: string, workspaceId: string): Promise<Room> {
    const room = this.loaded.get(documentId);
    if (room) {
      return Promise.resolve(room);
    }
    let pending = this.loading.get(documentId);
    if (!pending) {
      pending = this.load(documentId, workspaceId).finally(() => this.loading.delete(documentId));
      this.loading.set(documentId, pending);
    }
    return pending;
  }

  private async load(documentId: string, workspaceId: string): Promise<Room> {
    const stored = await this.store.load(documentId);
    const room = new Room(
      documentId,
      workspaceId,
      (doc) =>
        new RoomPersistence(documentId, doc, this.store, this.options, stored, () =>
          this.evict(documentId),
        ),
    );
    Y.transact(
      room.doc,
      () => {
        if (stored.state) {
          Y.applyUpdate(room.doc, stored.state);
        }
        for (const update of stored.updates) {
          Y.applyUpdate(room.doc, update.data);
        }
      },
      LOAD_ORIGIN,
    );
    this.loaded.set(documentId, room);
    this.logger.debug(
      { documentId, pendingUpdates: stored.updates.length, fromSnapshot: stored.state !== null },
      'Room loaded',
    );
    return room;
  }

  private evict(documentId: string) {
    const room = this.loaded.get(documentId);
    if (!room) {
      return;
    }
    for (const client of room.clients.values()) {
      client.socket.close(CloseCode.NotFound, 'Document no longer exists');
    }
    this.forget(room);
  }

  private forget(room: Room) {
    if (this.loaded.get(room.documentId) === room) {
      this.loaded.delete(room.documentId);
    }
    room.destroy();
  }
}
