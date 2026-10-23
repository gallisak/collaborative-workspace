import { Inject, Injectable } from '@nestjs/common';
import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  type GaugeConfiguration,
  Histogram,
  Registry,
} from 'prom-client';

export const METRICS_SERVICE_NAME = Symbol('METRICS_SERVICE_NAME');

@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  readonly httpRequestDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests',
    labelNames: ['method', 'route', 'status'] as const,
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [this.registry],
  });

  readonly documentsPublished = new Counter({
    name: 'documents_published_total',
    help: 'Share links created for documents',
    labelNames: ['access_level'] as const,
    registers: [this.registry],
  });

  readonly planChanges = new Counter({
    name: 'billing_plan_changes_total',
    help: 'Workspace plan changes applied from billing events',
    labelNames: ['from', 'to'] as const,
    registers: [this.registry],
  });

  readonly webhookDeliveries = new Counter({
    name: 'billing_webhook_deliveries_total',
    help: 'Billing webhook deliveries by outcome',
    labelNames: ['outcome'] as const,
    registers: [this.registry],
  });

  constructor(@Inject(METRICS_SERVICE_NAME) service: string) {
    this.registry.setDefaultLabels({ service });
    collectDefaultMetrics({ register: this.registry });
  }

  gauge<T extends string>(config: Omit<GaugeConfiguration<T>, 'registers'>) {
    return new Gauge<T>({ ...config, registers: [this.registry] });
  }
}
