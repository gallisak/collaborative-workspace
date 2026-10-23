import { WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { CLS_ID, ClsServiceManager } from 'nestjs-cls';
import { randomUUID } from 'node:crypto';

export interface TracedJob {
  correlationId?: string;
}

export function traced<T extends object>(data: T): T & TracedJob {
  const cls = ClsServiceManager.getClsService();
  const correlationId = cls.isActive() ? cls.getId() : undefined;
  return correlationId ? { ...data, correlationId } : data;
}

export abstract class TracedWorkerHost extends WorkerHost {
  protected abstract handle(job: Job): Promise<unknown>;

  process(job: Job): Promise<unknown> {
    const cls = ClsServiceManager.getClsService();
    const { correlationId } = (job.data ?? {}) as TracedJob;
    return cls.run(() => {
      cls.set(CLS_ID, correlationId ?? randomUUID());
      return this.handle(job);
    });
  }
}
