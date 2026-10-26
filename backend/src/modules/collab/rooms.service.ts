import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Y from 'yjs';
import type { Env } from '../../infra/config/env.schema.js';
import { PageRevalidationService } from '../publishing/page-revalidation.service.js';
import { SearchIndexingService } from '../search/search-indexing.service.js';
import { DocumentStore } from './document-store.js';
import { CloseCode } from './protocol.js';
import { type CollabClient, LOAD_ORIGIN, Room } from './room.js';
import { type PersistenceOptions, RoomPersistence } from './room-persistence.js';
import { SnapshotsService } from './snapshots.service.js';

const RELEASE_RETRY_MS = 5000;

export class RoomsClosedError extends Error {
  constructor() {
    super('Collaboration server is shutting down');
  }
}

@Injectable()
export class RoomsService {
  private readonly logger = new Logger(RoomsService.name);
  private readonly loading = new Map<string, Promise<Room>>();
  private readonly loaded = new Map<string, Room>();
  private readonly retrying = new WeakSet<Room>();
  private readonly options: PersistenceOptions;
  private closing = false;

  constructor(
    private readonly store: DocumentStore,
    private readonly snapshots: SnapshotsService,
    private readonly pages: PageRevalidationService,
    private readonly search: SearchIndexingService,
    config: ConfigService<Env, true>,
  ) {
    this.options = {
      flushIntervalMs: config.get('COLLAB_FLUSH_INTERVAL_MS', { infer: true }),
      compactionThreshold: config.get('COLLAB_COMPACTION_THRESHOLD', { infer: true }),
    };
  }

  async join(documentId: string, workspaceId: string, client: CollabClient): Promise<Room> {
    const room = await this.acquireOpen(documentId, workspaceId);
    room.join(client);
    return room;
  }

  async use<T>(documentId: string, workspaceId: string, work: (room: Room) => Promise<T>) {
    const room = await this.acquireOpen(documentId, workspaceId);
    room.holds++;
    try {
      return await work(room);
    } finally {
      room.holds--;
      await this.release(room);
    }
  }

  async release(room: Room) {
    if (!this.isIdle(room)) {
      return;
    }
    await this.persist(room);
    if (!this.isIdle(room) || this.loaded.get(room.documentId) !== room) {
      return;
    }
    if (room.persistence.dirty) {
      this.retryRelease(room);
      return;
    }
    this.forget(room);
    this.logger.debug({ documentId: room.documentId }, 'Room closed');
  }

  stats() {
    const rooms = [...this.loaded.values()];
    return {
      rooms: rooms.length,
      connections: rooms.reduce((sum, room) => sum + room.clients.size, 0),
    };
  }

  all(): Room[] {
    return [...this.loaded.values()];
  }

  inWorkspace(workspaceId: string): Room[] {
    return [...this.loaded.values()].filter((room) => room.workspaceId === workspaceId);
  }

  async closeAll() {
    this.closing = true;
    await Promise.allSettled(this.loading.values());
    await Promise.all(
      [...this.loaded.values()].map(async (room) => {
        for (const client of room.clients.values()) {
          client.socket.close(CloseCode.ServerRestart, 'Server restarting');
        }
        await this.persist(room);
        if (room.persistence.dirty) {
          this.logger.error(
            { documentId: room.documentId },
            'Unsaved changes are lost on shutdown, clients resend them on reconnect',
          );
        }
        this.forget(room);
      }),
    );
  }

  private async persist(room: Room) {
    await room.persistence.flushAndCompact();
    try {
      await this.snapshots.takeIfChanged(room);
    } catch (error) {
      this.logger.error({ err: error, documentId: room.documentId }, 'Saving a version failed');
    }
  }

  private retryRelease(room: Room) {
    if (this.retrying.has(room)) {
      return;
    }
    this.retrying.add(room);
    setTimeout(() => {
      this.retrying.delete(room);
      void this.release(room);
    }, RELEASE_RETRY_MS);
  }

  private isIdle(room: Room) {
    return !room.closed && room.clients.size === 0 && room.holds === 0;
  }

  private async acquireOpen(documentId: string, workspaceId: string): Promise<Room> {
    for (;;) {
      if (this.closing) {
        throw new RoomsClosedError();
      }
      const room = await this.acquire(documentId, workspaceId);
      if (!room.closed) {
        return room;
      }
    }
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
    const [stored, lastVersionAt] = await Promise.all([
      this.store.load(documentId),
      this.snapshots.lastVersionAt(documentId),
    ]);
    const room: Room = new Room(
      documentId,
      workspaceId,
      (doc) =>
        new RoomPersistence(
          documentId,
          doc,
          this.store,
          this.options,
          stored,
          () => this.evict(documentId),
          async () => {
            await this.snapshots.takeIfDue(room);
            await this.search.schedule([documentId]);
            await this.pages.scheduleIfPublished([documentId]);
          },
        ),
    );
    room.lastVersionAt = lastVersionAt;
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
