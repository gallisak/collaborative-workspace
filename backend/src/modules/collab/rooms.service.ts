import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Y from 'yjs';
import type { Env } from '../../infra/config/env.schema.js';
import { PageRevalidationService } from '../publishing/page-revalidation.service.js';
import { DocumentStore } from './document-store.js';
import { CloseCode } from './protocol.js';
import { type CollabClient, LOAD_ORIGIN, Room } from './room.js';
import { type PersistenceOptions, RoomPersistence } from './room-persistence.js';
import { SnapshotsService } from './snapshots.service.js';

@Injectable()
export class RoomsService {
  private readonly logger = new Logger(RoomsService.name);
  private readonly loading = new Map<string, Promise<Room>>();
  private readonly loaded = new Map<string, Room>();
  private readonly options: PersistenceOptions;

  constructor(
    private readonly store: DocumentStore,
    private readonly snapshots: SnapshotsService,
    private readonly pages: PageRevalidationService,
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
    await room.persistence.flushAndCompact();
    await this.snapshots.takeIfChanged(room);
    if (this.isIdle(room) && this.loaded.get(room.documentId) === room) {
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
        await this.snapshots.takeIfChanged(room);
        this.forget(room);
      }),
    );
  }

  private isIdle(room: Room) {
    return !room.closed && room.clients.size === 0 && room.holds === 0;
  }

  private async acquireOpen(documentId: string, workspaceId: string): Promise<Room> {
    for (;;) {
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
