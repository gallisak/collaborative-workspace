import { redisConnectionFromUrl } from './redis-url.js';

describe('redisConnectionFromUrl', () => {
  it('reads host, port and database', () => {
    expect(redisConnectionFromUrl('redis://localhost:6380/2')).toEqual({
      host: 'localhost',
      port: 6380,
      db: 2,
    });
  });

  it('applies defaults', () => {
    expect(redisConnectionFromUrl('redis://redis')).toEqual({ host: 'redis', port: 6379, db: 0 });
  });

  it('keeps ACL credentials and enables TLS for rediss', () => {
    expect(redisConnectionFromUrl('rediss://app:p%40ss@cache.example.com:6390/1')).toEqual({
      host: 'cache.example.com',
      port: 6390,
      db: 1,
      username: 'app',
      password: 'p@ss',
      tls: {},
    });
  });
});
