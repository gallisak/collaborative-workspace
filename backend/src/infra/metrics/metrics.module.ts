import { type DynamicModule, Global, Module } from '@nestjs/common';
import { MetricsController } from './metrics.controller.js';
import { METRICS_SERVICE_NAME, MetricsService } from './metrics.service.js';

@Global()
@Module({})
export class MetricsModule {
  static forService(service: 'api' | 'collab' | 'worker'): DynamicModule {
    return {
      module: MetricsModule,
      controllers: [MetricsController],
      providers: [{ provide: METRICS_SERVICE_NAME, useValue: service }, MetricsService],
      exports: [MetricsService],
    };
  }
}
