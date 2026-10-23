import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { CoreModule } from './infra/core.module.js';
import { HealthModule } from './infra/health/health.module.js';
import { ThrottlingModule } from './infra/throttling/throttling.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CommentsModule } from './modules/comments/comments.module.js';
import { DocumentsModule } from './modules/documents/documents.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { PermissionsModule } from './modules/permissions/permissions.module.js';
import { PublishingModule } from './modules/publishing/publishing.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { VersionsModule } from './modules/versions/versions.module.js';
import { WorkspacesModule } from './modules/workspaces/workspaces.module.js';

@Module({
  imports: [
    CoreModule,
    HealthModule,
    UsersModule,
    AuthModule,
    ThrottlingModule,
    PermissionsModule,
    WorkspacesModule,
    DocumentsModule,
    VersionsModule,
    CommentsModule,
    NotificationsModule,
    PublishingModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule {}
