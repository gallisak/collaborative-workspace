import { Module } from '@nestjs/common';
import { AttachmentsPurgeService } from './attachments-purge.service.js';

@Module({
  providers: [AttachmentsPurgeService],
  exports: [AttachmentsPurgeService],
})
export class AttachmentsPurgeModule {}
