import { Module } from '@nestjs/common';
import { DocumentStore } from '../collab/document-store.js';
import { PermissionsModule } from '../permissions/permissions.module.js';
import { PageRevalidationModule } from './page-revalidation.module.js';
import { PublicDocumentsService } from './public-documents.service.js';
import { PublicDocumentsController, ShareLinksController } from './publishing.controller.js';
import { ShareLinksRepository } from './share-links.repository.js';
import { ShareLinksService } from './share-links.service.js';

@Module({
  imports: [PermissionsModule, PageRevalidationModule],
  controllers: [ShareLinksController, PublicDocumentsController],
  providers: [ShareLinksService, ShareLinksRepository, PublicDocumentsService, DocumentStore],
})
export class PublishingModule {}
