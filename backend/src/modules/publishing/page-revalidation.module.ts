import { Module } from '@nestjs/common';
import { PageRevalidationService } from './page-revalidation.service.js';

@Module({
  providers: [PageRevalidationService],
  exports: [PageRevalidationService],
})
export class PageRevalidationModule {}
