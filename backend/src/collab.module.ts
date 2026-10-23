import { Module } from '@nestjs/common';
import { CoreModule } from './infra/core.module.js';
import { HealthModule } from './infra/health/health.module.js';
import { MetricsModule } from './infra/metrics/metrics.module.js';
import { CollabGatewayModule } from './modules/collab/collab.module.js';

@Module({
  imports: [CoreModule, MetricsModule.forService('collab'), HealthModule, CollabGatewayModule],
})
export class CollabModule {}
