import { Module } from '@nestjs/common';
import { PermissionsModule } from '../permissions/permissions.module.js';
import { VersionsController } from './versions.controller.js';
import { VersionsRepository } from './versions.repository.js';
import { VersionsService } from './versions.service.js';

@Module({
  imports: [PermissionsModule],
  controllers: [VersionsController],
  providers: [VersionsService, VersionsRepository],
})
export class VersionsModule {}
