import { Module } from '@nestjs/common';
import { AttachmentsRepository } from './attachments.repository.js';
import { UploadCleanupProcessor } from './upload-cleanup.processor.js';

@Module({
  providers: [UploadCleanupProcessor, AttachmentsRepository],
})
export class AttachmentsWorkerModule {}
