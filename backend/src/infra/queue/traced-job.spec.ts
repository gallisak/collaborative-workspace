import type { Job } from 'bullmq';
import { CLS_ID, ClsServiceManager } from 'nestjs-cls';
import { traced, TracedWorkerHost } from './traced-job.js';

class Probe extends TracedWorkerHost {
  protected handle() {
    return Promise.resolve(ClsServiceManager.getClsService().getId());
  }
}

describe('traced jobs', () => {
  const cls = ClsServiceManager.getClsService();

  it('stores the correlation id of the current request in the job', () => {
    const data = cls.run(() => {
      cls.set(CLS_ID, 'request-1234');
      return traced({ commentId: 'c1' });
    });
    expect(data).toEqual({ commentId: 'c1', correlationId: 'request-1234' });
  });

  it('leaves the job untouched outside of a request', () => {
    expect(traced({ commentId: 'c1' })).toEqual({ commentId: 'c1' });
  });

  it('restores the correlation id while the worker handles the job', async () => {
    const job = { data: { correlationId: 'request-1234' } } as Job;
    expect(await new Probe().process(job)).toBe('request-1234');
  });

  it('gives jobs without one a fresh id', async () => {
    const id = await new Probe().process({ data: {} } as Job);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });
});
