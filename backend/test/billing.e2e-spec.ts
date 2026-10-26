import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import { MailService } from '../src/infra/mail/mail.service.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { CHECKOUT_COMPLETED } from '../src/modules/billing/billing-event.js';
import { SIGNATURE_HEADER, signPayload } from '../src/modules/billing/webhook-signature.js';
import { eventually } from './collab-harness.js';
import {
  CapturingMail,
  cleanupE2eData,
  createTestApp,
  E2E_EMAIL_DOMAIN,
  signUp,
  startWorker,
  type TestUser,
} from './helpers.js';

describe('Billing (e2e)', () => {
  let app: INestApplication;
  let worker: INestApplication;
  let prisma: PrismaService;
  let secret: string;
  const mail = new CapturingMail();

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp({ overrides: [{ token: MailService, value: mail }] }));
    worker = await startWorker();
    secret = app.get(ConfigService).getOrThrow<string>('BILLING_WEBHOOK_SECRET');
  });

  afterAll(async () => {
    await worker.close();
    await cleanupE2eData(prisma);
    await app.close();
  });

  const setup = async () => {
    const owner = await signUp(app);
    const workspace = await owner.post('/api/workspaces').send({ name: 'E2E billing' }).expect(201);
    return { owner, workspaceId: workspace.body.id as string };
  };

  const invite = (owner: TestUser, workspaceId: string) =>
    owner
      .post(`/api/workspaces/${workspaceId}/invitations`)
      .send({ email: `invitee-${randomUUID()}${E2E_EMAIL_DOMAIN}`, role: 'EDITOR' });

  const startCheckout = async (owner: TestUser, workspaceId: string, planId = 'PRO') => {
    const res = await owner
      .post(`/api/workspaces/${workspaceId}/billing/checkout`)
      .send({ planId })
      .expect(201);
    return res.body as { id: string; status: string; url: string };
  };

  const planOf = async (workspaceId: string) =>
    (await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } })).planId;

  const completedEvent = (sessionId: string, workspaceId: string, planId = 'PRO') => ({
    id: `evt_${randomBytes(8).toString('hex')}`,
    type: CHECKOUT_COMPLETED,
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: sessionId,
        workspaceId,
        planId,
        subscriptionId: `sub_${randomBytes(8).toString('hex')}`,
        currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      },
    },
  });

  const deliver = (event: object, signWith = secret) => {
    const payload = JSON.stringify(event);
    return request(app.getHttpServer())
      .post('/api/billing/webhook')
      .set('Content-Type', 'application/json')
      .set(SIGNATURE_HEADER, signPayload(signWith, payload, Math.floor(Date.now() / 1000)))
      .send(payload);
  };

  it('upgrades the plan through checkout, mock payment and webhook, lifting the limits', async () => {
    const { owner, workspaceId } = await setup();
    await invite(owner, workspaceId).expect(201);
    await invite(owner, workspaceId).expect(201);
    const blocked = await invite(owner, workspaceId).expect(402);
    expect(blocked.body.message).toContain('Free plan allows up to 3 members');

    const session = await startCheckout(owner, workspaceId);
    expect(session).toMatchObject({ status: 'OPEN' });
    expect(session.url).toContain(`/billing/checkout/${session.id}`);
    await owner.post(`/api/billing/checkout-sessions/${session.id}/pay`).expect(202);

    await eventually(async () => (await planOf(workspaceId)) === 'PRO');
    const billing = await owner.get(`/api/workspaces/${workspaceId}/billing`).expect(200);
    expect(billing.body).toMatchObject({
      plan: { id: 'PRO', maxMembers: 10 },
      subscription: { status: 'ACTIVE' },
      usage: { members: 1, pendingInvitations: 2, documents: 0 },
    });
    const paid = await owner.get(`/api/billing/checkout-sessions/${session.id}`).expect(200);
    expect(paid.body.status).toBe('COMPLETED');
    await owner.post(`/api/billing/checkout-sessions/${session.id}/pay`).expect(409);
    await invite(owner, workspaceId).expect(201);
  });

  it('applies a webhook event once, however many times it is delivered', async () => {
    const { owner, workspaceId } = await setup();
    const session = await startCheckout(owner, workspaceId);
    const event = completedEvent(session.id, workspaceId);

    const deliveries = await Promise.all([deliver(event), deliver(event), deliver(event)]);
    expect(deliveries.map((res) => res.status)).toEqual([200, 200, 200]);
    await eventually(async () => {
      const stored = await prisma.billingEvent.findUnique({ where: { id: event.id } });
      return stored?.processedAt !== null && stored !== null;
    });
    const subscription = await prisma.subscription.findUniqueOrThrow({ where: { workspaceId } });

    await deliver(event).expect(200);
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(await prisma.billingEvent.count({ where: { id: event.id } })).toBe(1);
    expect(await planOf(workspaceId)).toBe('PRO');
    expect(await prisma.subscription.findUniqueOrThrow({ where: { workspaceId } })).toEqual(
      subscription,
    );
  });

  it('does not charge twice when another event reports the same checkout', async () => {
    const { owner, workspaceId } = await setup();
    const session = await startCheckout(owner, workspaceId);
    const first = completedEvent(session.id, workspaceId);
    await deliver(first).expect(200);
    await eventually(async () => (await planOf(workspaceId)) === 'PRO');
    const subscription = await prisma.subscription.findUniqueOrThrow({ where: { workspaceId } });

    const second = completedEvent(session.id, workspaceId);
    await deliver(second).expect(200);
    await eventually(async () => {
      const stored = await prisma.billingEvent.findUniqueOrThrow({ where: { id: second.id } });
      return stored.processedAt !== null;
    });

    expect(await prisma.subscription.findUniqueOrThrow({ where: { workspaceId } })).toEqual(
      subscription,
    );
  });

  it('rejects webhooks with a wrong signature or a tampered payload', async () => {
    const { owner, workspaceId } = await setup();
    const session = await startCheckout(owner, workspaceId);
    const event = completedEvent(session.id, workspaceId);

    await deliver(event, 'not-the-real-secret').expect(400);
    const payload = JSON.stringify(event);
    const header = signPayload(secret, payload, Math.floor(Date.now() / 1000));
    await request(app.getHttpServer())
      .post('/api/billing/webhook')
      .set('Content-Type', 'application/json')
      .set(SIGNATURE_HEADER, header)
      .send(payload.replace('"PRO"', '"TEAM"'))
      .expect(400);
    await request(app.getHttpServer()).post('/api/billing/webhook').send(event).expect(400);

    expect(await prisma.billingEvent.count({ where: { id: event.id } })).toBe(0);
    expect(await planOf(workspaceId)).toBe('FREE');
  });

  it('lets only admins manage billing', async () => {
    const { owner, workspaceId } = await setup();
    const editor = await signUp(app);
    const stranger = await signUp(app);
    await owner
      .post(`/api/workspaces/${workspaceId}/invitations`)
      .send({ email: editor.email, role: 'EDITOR' })
      .expect(201);
    await editor
      .post('/api/invitations/accept')
      .send({ token: mail.tokenFor(editor.email) })
      .expect(200);
    const session = await startCheckout(owner, workspaceId);

    await editor.get(`/api/workspaces/${workspaceId}/billing`).expect(200);
    await editor
      .post(`/api/workspaces/${workspaceId}/billing/checkout`)
      .send({ planId: 'PRO' })
      .expect(403);
    await stranger
      .post(`/api/workspaces/${workspaceId}/billing/checkout`)
      .send({ planId: 'PRO' })
      .expect(404);
    await editor.get(`/api/billing/checkout-sessions/${session.id}`).expect(404);
    await editor.post(`/api/billing/checkout-sessions/${session.id}/pay`).expect(404);
    await owner
      .post(`/api/workspaces/${workspaceId}/billing/checkout`)
      .send({ planId: 'FREE' })
      .expect(400);
  });

  it('refuses expired sessions, the current plan and plans too small for the team', async () => {
    const { owner, workspaceId } = await setup();
    const session = await startCheckout(owner, workspaceId);
    await prisma.checkoutSession.update({
      where: { id: session.id },
      data: { createdAt: new Date(Date.now() - 60_000), expiresAt: new Date(Date.now() - 1000) },
    });
    await owner.post(`/api/billing/checkout-sessions/${session.id}/pay`).expect(400);
    const expired = await prisma.checkoutSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(expired.status).toBe('EXPIRED');

    await prisma.workspace.update({ where: { id: workspaceId }, data: { planId: 'TEAM' } });
    await owner
      .post(`/api/workspaces/${workspaceId}/billing/checkout`)
      .send({ planId: 'TEAM' })
      .expect(400);
    const users = Array.from({ length: 10 }, () => ({
      email: `bulk-${randomUUID()}${E2E_EMAIL_DOMAIN}`,
      name: 'Bulk',
      passwordHash: 'x',
    }));
    await prisma.user.createMany({ data: users });
    const created = await prisma.user.findMany({
      where: { email: { in: users.map((u) => u.email) } },
    });
    await prisma.workspaceMember.createMany({
      data: created.map((user) => ({ workspaceId, userId: user.id, role: 'VIEWER' as const })),
    });
    const tooSmall = await owner
      .post(`/api/workspaces/${workspaceId}/billing/checkout`)
      .send({ planId: 'PRO' })
      .expect(409);
    expect(tooSmall.body.message).toContain('allows up to 10 members, the workspace has 11');
  });

  it('does not apply a paid downgrade when the team outgrew the plan before payment', async () => {
    const { owner, workspaceId } = await setup();
    await prisma.workspace.update({ where: { id: workspaceId }, data: { planId: 'TEAM' } });
    const session = await startCheckout(owner, workspaceId, 'PRO');
    await prisma.attachment.create({
      data: {
        workspaceId,
        objectKey: `workspaces/${workspaceId}/${randomUUID()}`,
        fileName: 'huge.png',
        contentType: 'image/png',
        sizeBytes: 11n * 1024n ** 3n,
        status: 'UPLOADED',
      },
    });

    await owner.post(`/api/billing/checkout-sessions/${session.id}/pay`).expect(202);

    await eventually(async () => {
      const stored = await prisma.checkoutSession.findUniqueOrThrow({ where: { id: session.id } });
      return stored.status === 'FAILED';
    });
    expect(await planOf(workspaceId)).toBe('TEAM');
    const failed = await owner.get(`/api/billing/checkout-sessions/${session.id}`).expect(200);
    expect(failed.body).toMatchObject({ status: 'FAILED' });
    expect(failed.body.failureReason).toContain('includes 10 GB of storage');
    await owner.post(`/api/billing/checkout-sessions/${session.id}/pay`).expect(409);
  });

  it('lists the plans', async () => {
    const { owner } = await setup();
    const res = await owner.get('/api/billing/plans').expect(200);
    expect(res.body.map((plan: { id: string }) => plan.id)).toEqual(['FREE', 'PRO', 'TEAM']);
    expect(res.body[0]).toMatchObject({ maxMembers: 3, maxDocuments: 100 });
  });
});
