import { Global, Module } from '@nestjs/common';
import { CollabEventsService } from './collab-events.service.js';

@Global()
@Module({
  providers: [CollabEventsService],
  exports: [CollabEventsService],
})
export class CollabEventsModule {}
