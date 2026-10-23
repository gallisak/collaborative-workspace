import { Module } from '@nestjs/common';
import { TokensModule } from '../auth/tokens.module.js';
import { PermissionsModule } from '../permissions/permissions.module.js';
import { UsersModule } from '../users/users.module.js';
import { CollabGateway } from './collab.gateway.js';
import { DocumentStore } from './document-store.js';
import { RoomsService } from './rooms.service.js';

@Module({
  imports: [TokensModule, PermissionsModule, UsersModule],
  providers: [CollabGateway, RoomsService, DocumentStore],
})
export class CollabGatewayModule {}
