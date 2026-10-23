import { getQueueToken } from '@nestjs/bullmq';
import type { INestApplication } from '@nestjs/common';
import type { Queue } from 'bullmq';
import request from 'supertest';
import { MailService } from '../src/infra/mail/mail.service.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { NOTIFICATIONS_QUEUE } from '../src/infra/queue/notification-jobs.js';
import { CapturingMail, cleanupE2eData, createTestApp, signUp } from './helpers.js';

const sample = (text: string, name: string, labels: Record<string, string>) => {
  const line = text
    .split('\n')
    .find(
      (row) =>
        row.startsWith(`${name}{`) &&
        Object.entries(labels).every(([key, value]) => row.includes(`${key}="${value}"`)),
    );
  return line ? Number(line.split(' ').at(-1)) : 0;
};

describe('Observability (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const mail = new CapturingMail();

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp({ overrides: [{ token: MailService, value: mail }] }));
  });

  afterAll(async () => {
    await cleanupE2eData(prisma);
    await app.close();
  });

  const metrics = async () => (await request(app.getHttpServer()).get('/metrics').expect(200)).text;

  it('reports readiness of the database and Redis', async () => {
    const res = await request(app.getHttpServer()).get('/health/ready').expect(200);
    expect(res.body).toEqual({ status: 'ok', checks: { database: 'up', redis: 'up' } });
  });

  it('exposes Prometheus metrics with route templates instead of raw ids', async () => {
    const owner = await signUp(app);
    const workspace = await owner.post('/api/workspaces').send({ name: 'E2E metrics' }).expect(201);
    const doc = await owner
      .post(`/api/workspaces/${workspace.body.id}/documents`)
      .send({ title: 'Doc' })
      .expect(201);
    await owner.get(`/api/documents/${doc.body.id}`).expect(200);
    await owner
      .post(`/api/documents/${doc.body.id}/share-links`)
      .send({ accessLevel: 'VIEW' })
      .expect(201);

    const text = await metrics();

    expect(text).toContain('# TYPE http_request_duration_seconds histogram');
    expect(
      sample(text, 'http_request_duration_seconds_count', {
        service: 'api',
        method: 'GET',
        route: '/api/documents/:documentId',
        status: '200',
      }),
    ).toBeGreaterThan(0);
    expect(text).not.toContain(doc.body.id);
    expect(
      sample(text, 'documents_published_total', { service: 'api', access_level: 'VIEW' }),
    ).toBeGreaterThan(0);
    expect(text).toContain('process_resident_memory_bytes');
  });

  it('carries the correlation id of a request into the jobs it enqueues', async () => {
    const owner = await signUp(app);
    const editor = await signUp(app);
    const workspace = await owner.post('/api/workspaces').send({ name: 'E2E trace' }).expect(201);
    const doc = await owner
      .post(`/api/workspaces/${workspace.body.id}/documents`)
      .send({ title: 'Doc' })
      .expect(201);
    await owner
      .put(`/api/documents/${doc.body.id}/permissions`)
      .send({ email: editor.email, accessLevel: 'VIEW' })
      .expect(204);

    const res = await owner
      .post(`/api/documents/${doc.body.id}/threads`)
      .set('X-Correlation-Id', 'e2e-trace-0001')
      .send({ blockId: 'b', body: 'hi', mentionedUserIds: [editor.id] })
      .expect(201);
    expect(res.headers['x-correlation-id']).toBe('e2e-trace-0001');

    const queue = app.get<Queue>(getQueueToken(NOTIFICATIONS_QUEUE));
    const job = await queue.getJob(res.body.comments[0].id as string);
    expect(job?.data).toMatchObject({ correlationId: 'e2e-trace-0001' });
  });
});
