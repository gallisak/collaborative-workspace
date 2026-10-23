import { Module } from '@nestjs/common';
import { TokensModule } from '../auth/tokens.module.js';
import { PermissionsModule } from '../permissions/permissions.module.js';
import { PageRevalidationModule } from '../publishing/page-revalidation.module.js';
import { SearchIndexingModule } from '../search/search-indexing.module.js';
import { UsersModule } from '../users/users.module.js';
import { CollabGateway } from './collab.gateway.js';
import { CollabMetrics } from './collab-metrics.js';
import { CollabJobsProcessor } from './collab-jobs.processor.js';
import { DocumentStore } from './document-store.js';
import { RoomsService } from './rooms.service.js';
import { SnapshotsService } from './snapshots.service.js';
import { VersionStore } from './version-store.js';

@Module({
  imports: [
    TokensModule,
    PermissionsModule,
    UsersModule,
    PageRevalidationModule,
    SearchIndexingModule,
  ],
  providers: [
    CollabGateway,
    RoomsService,
    DocumentStore,
    SnapshotsService,
    VersionStore,
    CollabJobsProcessor,
    CollabMetrics,
  ],
})
export class CollabGatewayModule {}
