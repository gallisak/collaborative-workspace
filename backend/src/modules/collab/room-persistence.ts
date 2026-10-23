import { Logger } from '@nestjs/common';
import * as Y from 'yjs';
import { Prisma } from '../../generated/prisma/client.js';
import type { DocumentStore, StoredDocument } from './document-store.js';

export interface PersistenceOptions {
  flushIntervalMs: number;
  compactionThreshold: number;
}

const isMissingDocument = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003';

export class RoomPersistence {
  private readonly logger = new Logger(RoomPersistence.name);
  private pending: Uint8Array[] = [];
  private timer: NodeJS.Timeout | null = null;
  private queue: Promise<void> = Promise.resolve();
  private lastUpdateId: bigint;
  private snapshotUpdateId: bigint;
  private updatesSinceSnapshot: number;

  constructor(
    private readonly documentId: string,
    private readonly doc: Y.Doc,
    private readonly store: DocumentStore,
    private readonly options: PersistenceOptions,
    stored: StoredDocument,
    private readonly onDocumentGone: () => void,
    private readonly afterWrite: () => Promise<void>,
  ) {
    this.snapshotUpdateId = stored.snapshotUpdateId;
    this.lastUpdateId = stored.updates.at(-1)?.id ?? stored.snapshotUpdateId;
    this.updatesSinceSnapshot = stored.updates.length;
  }

  record(update: Uint8Array) {
    this.pending.push(update);
    this.timer ??= setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, this.options.flushIntervalMs);
  }

  flush(): Promise<void> {
    return this.enqueue(() => this.writePending());
  }

  flushAndCompact(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    return this.enqueue(async () => {
      await this.writePending();
      await this.compact();
    });
  }

  private enqueue(work: () => Promise<void>): Promise<void> {
    this.queue = this.queue.then(work).catch((error: unknown) => {
      if (isMissingDocument(error)) {
        this.pending = [];
        this.onDocumentGone();
        return;
      }
      this.logger.error({ err: error, documentId: this.documentId }, 'Persisting document failed');
    });
    return this.queue;
  }

  private async writePending() {
    if (this.pending.length === 0) {
      return;
    }
    const batch = this.pending;
    this.pending = [];
    try {
      this.lastUpdateId = await this.store.append(this.documentId, Y.mergeUpdates(batch));
    } catch (error) {
      this.pending = [...batch, ...this.pending];
      throw error;
    }
    this.updatesSinceSnapshot++;
    if (this.updatesSinceSnapshot >= this.options.compactionThreshold) {
      await this.compact();
    }
    await this.afterWrite();
  }

  private async compact() {
    if (this.lastUpdateId <= this.snapshotUpdateId) {
      return;
    }
    const upTo = this.lastUpdateId;
    await this.store.compact(this.documentId, Y.encodeStateAsUpdate(this.doc), upTo);
    this.snapshotUpdateId = upTo;
    this.updatesSinceSnapshot = 0;
    this.logger.debug({ documentId: this.documentId, upTo: upTo.toString() }, 'Document compacted');
  }
}
