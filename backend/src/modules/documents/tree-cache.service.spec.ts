import type { Redis } from 'ioredis';
import { TreeCacheService } from './tree-cache.service.js';

class FakeRedis {
  readonly store = new Map<string, string>();
  failing = false;

  private check() {
    if (this.failing) {
      throw new Error('redis down');
    }
  }

  get(key: string) {
    this.check();
    return Promise.resolve(this.store.get(key) ?? null);
  }

  set(key: string, value: string) {
    this.check();
    this.store.set(key, value);
    return Promise.resolve('OK');
  }

  incr(key: string) {
    this.check();
    const next = Number(this.store.get(key) ?? 0) + 1;
    this.store.set(key, String(next));
    return Promise.resolve(next);
  }
}

const setup = () => {
  const redis = new FakeRedis();
  return { redis, cache: new TreeCacheService(redis as unknown as Redis) };
};

describe('TreeCacheService', () => {
  it('serves cached data until invalidated', async () => {
    const { cache } = setup();
    const load = vi.fn().mockResolvedValueOnce(['v1']).mockResolvedValueOnce(['v2']);

    expect(await cache.get('w', load)).toEqual(['v1']);
    expect(await cache.get('w', load)).toEqual(['v1']);
    await cache.invalidate('w');
    expect(await cache.get('w', load)).toEqual(['v2']);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('never serves a value loaded before an invalidation that happened during the load', async () => {
    const { cache } = setup();
    let release!: (value: string[]) => void;
    const slowStaleLoad = () => new Promise<string[]>((resolve) => (release = resolve));

    const staleRead = cache.get('w', slowStaleLoad);
    await new Promise((resolve) => setImmediate(resolve));
    await cache.invalidate('w');
    release(['stale']);
    await staleRead;

    expect(await cache.get('w', () => Promise.resolve(['fresh']))).toEqual(['fresh']);
  });

  it('falls back to the loader when redis is unavailable', async () => {
    const { redis, cache } = setup();
    redis.failing = true;

    expect(await cache.get('w', () => Promise.resolve(['db']))).toEqual(['db']);
    await expect(cache.invalidate('w')).resolves.toBeUndefined();
  });
});
