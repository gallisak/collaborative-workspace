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

  it('returns errors in a single shape with a correlation id', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/nope')
      .set('x-correlation-id', 'e2e-correlation-1')
      .expect(404);

    expect(res.headers['x-correlation-id']).toBe('e2e-correlation-1');
    expect(res.body).toMatchObject({
      statusCode: 404,
      error: 'NOT_FOUND',
      correlationId: 'e2e-correlation-1',
      path: '/api/nope',
    });
  });
});
