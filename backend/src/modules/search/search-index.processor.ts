import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Job, Queue } from 'bullmq';
import * as Y from 'yjs';
import type { Env } from '../../infra/config/env.schema.js';
import { type IndexDocumentJob, SEARCH_QUEUE, SearchJob } from '../../infra/queue/search-jobs.js';
import { CONTENT_FIELD } from '../collab/document-content.js';
import { DocumentStore } from '../collab/document-store.js';
import { documentText } from './document-text.js';
import { SearchIndexingService } from './search-indexing.service.js';
import { SearchRepository } from './search.repository.js';

const RECONCILE_BATCH = 500;

@Processor(SEARCH_QUEUE)
export class SearchIndexProcessor extends WorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger(SearchIndexProcessor.name);
  private readonly reconcileEveryMs: number;

  constructor(
    private readonly search: SearchRepository,
    private readonly store: DocumentStore,
    private readonly indexing: SearchIndexingService,
    @InjectQueue(SEARCH_QUEUE) private readonly queue: Queue,
    config: ConfigService<Env, true>,
  ) {
    super();
    this.reconcileEveryMs = config.get('SEARCH_RECONCILE_INTERVAL_MS', { infer: true });
  }

  async onApplicationBootstrap() {
    await this.queue.upsertJobScheduler(
      SearchJob.Reconcile,
      { every: this.reconcileEveryMs },
      { name: SearchJob.Reconcile },
    );
  }

  async process(job: Job<IndexDocumentJob>) {
    switch (job.name) {
      case SearchJob.IndexDocument:
        return this.index(job.data.documentId);
      case SearchJob.Reconcile:
        return this.reconcile();
      default:
        throw new Error(`Unknown search job ${job.name}`);
    }
  }

  async index(documentId: string) {
    const document = await this.search.findDocument(documentId);
    if (!document || document.deletedAt) {
      this.logger.debug({ documentId }, 'Skipping indexing of a deleted document');
      return;
    }
    const stored = await this.store.load(documentId);
    const doc = new Y.Doc();
    try {
      if (stored.state) {
        Y.applyUpdate(doc, stored.state);
      }
      for (const update of stored.updates) {
        Y.applyUpdate(doc, update.data);
      }
      const indexedUpdateId = stored.updates.at(-1)?.id ?? stored.snapshotUpdateId;
      const written = await this.search.upsert(
        documentId,
        document.title,
        documentText(doc.getXmlFragment(CONTENT_FIELD)),
        indexedUpdateId,
      );
      this.logger.debug(
        { documentId, indexedUpdateId: indexedUpdateId.toString(), stale: written === 0 },
        'Document indexed',
      );
    } finally {
      doc.destroy();
    }
  }

  private async reconcile() {
    const stale = await this.search.staleDocumentIds(RECONCILE_BATCH);
    if (stale.length > 0) {
      await this.indexing.schedule(stale);
      this.logger.log({ documents: stale.length }, 'Stale search index entries rescheduled');
    }
  }
}
