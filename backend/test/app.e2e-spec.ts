import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers.js';

describe('App (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health is public and served outside the /api prefix', async () => {
    await request(app.getHttpServer()).get('/health').expect(200, { status: 'ok' });
  });

  it('protects routes by default', async () => {
    await request(app.getHttpServer()).get('/api/auth/me').expect(401);
  });

  it('returns errors in a single shape with a correlation id', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('x-correlation-id', 'e2e-correlation-1')
      .expect(401);

    expect(res.headers['x-correlation-id']).toBe('e2e-correlation-1');
    expect(res.body).toMatchObject({
      statusCode: 401,
      error: 'UNAUTHORIZED',
      correlationId: 'e2e-correlation-1',
      path: '/api/auth/me',
    });
  });
});
