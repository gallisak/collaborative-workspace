import { Module } from '@nestjs/common';
import { DocumentStore } from '../collab/document-store.js';
import { SearchIndexProcessor } from './search-index.processor.js';
import { SearchIndexingModule } from './search-indexing.module.js';
import { SearchRepository } from './search.repository.js';

@Module({
  imports: [SearchIndexingModule],
  providers: [SearchIndexProcessor, SearchRepository, DocumentStore],
})
export class SearchWorkerModule {}
