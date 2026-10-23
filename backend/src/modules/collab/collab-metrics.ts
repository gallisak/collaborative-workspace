import { Injectable, type OnModuleInit } from '@nestjs/common';
import { MetricsService } from '../../infra/metrics/metrics.service.js';
import { RoomsService } from './rooms.service.js';

@Injectable()
export class CollabMetrics implements OnModuleInit {
  constructor(
    private readonly metrics: MetricsService,
    private readonly rooms: RoomsService,
  ) {}

  onModuleInit() {
    const rooms = this.rooms;
    this.metrics.gauge({
      name: 'collab_open_documents',
      help: 'Documents loaded in memory by the collaboration gateway',
      collect() {
        this.set(rooms.stats().rooms);
      },
    });
    this.metrics.gauge({
      name: 'collab_connections',
      help: 'Open collaboration WebSocket connections',
      collect() {
        this.set(rooms.stats().connections);
      },
    });
  }
}
