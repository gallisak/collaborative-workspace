import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import type { Env } from '../../infra/config/env.schema.js';
import { type IndexDocumentJob, SEARCH_QUEUE, SearchJob } from '../../infra/queue/search-jobs.js';

@Injectable()
export class SearchIndexingService {
  private readonly logger = new Logger(SearchIndexingService.name);
  private readonly delayMs: number;

  constructor(
    @InjectQueue(SEARCH_QUEUE) private readonly queue: Queue,
    config: ConfigService<Env, true>,
  ) {
    this.delayMs = config.get('SEARCH_INDEX_DELAY_MS', { infer: true });
  }

  async schedule(documentIds: readonly string[]) {
    try {
      await Promise.all(
        documentIds.map((documentId) => {
          const job: IndexDocumentJob = { documentId };
          return this.queue.add(SearchJob.IndexDocument, job, {
            delay: this.delayMs,
            deduplication: { id: documentId, keepLastIfActive: true },
          });
        }),
      );
    } catch (error) {
      this.logger.warn({ err: error, documentIds }, 'Scheduling search indexing failed');
    }
  }
}
