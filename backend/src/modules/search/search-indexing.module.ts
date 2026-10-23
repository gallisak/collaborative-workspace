import { Module } from '@nestjs/common';
import { SearchIndexingService } from './search-indexing.service.js';

@Module({
  providers: [SearchIndexingService],
  exports: [SearchIndexingService],
})
export class SearchIndexingModule {}
