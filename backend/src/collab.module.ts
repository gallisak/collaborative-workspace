import { Module } from '@nestjs/common';
import { CoreModule } from './infra/core.module.js';
import { HealthModule } from './infra/health/health.module.js';

@Module({
  imports: [CoreModule, HealthModule],
})
export class CollabModule {}
