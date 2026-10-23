import { Module } from '@nestjs/common';
import { PageRevalidationProcessor } from './page-revalidation.processor.js';
import { RevalidationClient } from './revalidation.client.js';

@Module({
  providers: [PageRevalidationProcessor, RevalidationClient],
})
export class PublishingWorkerModule {}
