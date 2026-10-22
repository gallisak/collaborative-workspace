import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { CoreModule } from './infra/core.module.js';
import { HealthModule } from './infra/health/health.module.js';
import { ThrottlingModule } from './infra/throttling/throttling.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { UsersModule } from './modules/users/users.module.js';

@Module({
  imports: [CoreModule, HealthModule, UsersModule, AuthModule, ThrottlingModule],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule {}
