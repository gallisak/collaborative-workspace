import type { INestApplication } from '@nestjs/common';
import { MailService } from '../src/infra/mail/mail.service.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import {
  CapturingMail,
  cleanupE2eData,
  createTestApp,
  signUp,
  type TestUser,
  uniqueEmail,
} from './helpers.js';

describe('Workspaces (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const mail = new CapturingMail();

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp({
      overrides: [{ token: MailService, value: mail }],
    }));
  });

  afterAll(async () => {
    await cleanupE2eData(prisma);
    await app.close();
  });

  const createWorkspace = async (owner: TestUser, name = 'E2E workspace') => {
    const res = await owner.post('/api/workspaces').send({ name }).expect(201);
    return res.body.id as string;
  };

  const invite = (actor: TestUser, workspaceId: string, email: string, role: string) =>
    actor.post(`/api/workspaces/${workspaceId}/invitations`).send({ email, role });

  const join = async (owner: TestUser, workspaceId: string, role: string) => {
    const member = await signUp(app);
    await invite(owner, workspaceId, member.email, role).expect(201);
    await member
      .post('/api/invitations/accept')
      .send({ token: mail.tokenFor(member.email) })
      .expect(200);
    return member;
  };

  describe('workspace lifecycle', () => {
    it('makes the creator the owner on the free plan', async () => {
      const owner = await signUp(app);
      const workspaceId = await createWorkspace(owner, '  Product  ');

      const list = await owner.get('/api/workspaces').expect(200);
      expect(list.body).toEqual([
        { id: workspaceId, name: 'Product', planId: 'FREE', role: 'OWNER' },
      ]);

      const details = await owner.get(`/api/workspaces/${workspaceId}`).expect(200);
      expect(details.body).toMatchObject({
        role: 'OWNER',
        memberCount: 1,
        plan: { id: 'FREE', maxMembers: 3, maxDocuments: 100, maxStorageBytes: 104857600 },
      });
    });

    it('hides workspaces from non-members behind 404', async () => {
      const owner = await signUp(app);
      const stranger = await signUp(app);
      const workspaceId = await createWorkspace(owner);

      await stranger.get(`/api/workspaces/${workspaceId}`).expect(404);
      await stranger.get(`/api/workspaces/${workspaceId}/members`).expect(404);
      await stranger.patch(`/api/workspaces/${workspaceId}`).send({ name: 'Hacked' }).expect(404);
      await invite(stranger, workspaceId, uniqueEmail(), 'VIEWER').expect(404);
      await stranger.delete(`/api/workspaces/${workspaceId}`).expect(404);
    });

    it('rejects malformed ids', async () => {
      const user = await signUp(app);
      await user.get('/api/workspaces/not-a-uuid').expect(400);
    });

    it('lets admins rename but only the owner delete', async () => {
      const owner = await signUp(app);
      const workspaceId = await createWorkspace(owner);
      const admin = await join(owner, workspaceId, 'ADMIN');
      const editor = await join(owner, workspaceId, 'EDITOR');

      await editor.patch(`/api/workspaces/${workspaceId}`).send({ name: 'Nope' }).expect(403);
      await admin.patch(`/api/workspaces/${workspaceId}`).send({ name: 'Renamed' }).expect(200);
      await admin.delete(`/api/workspaces/${workspaceId}`).expect(403);
      await owner.delete(`/api/workspaces/${workspaceId}`).expect(204);
      await owner.get(`/api/workspaces/${workspaceId}`).expect(404);
    });
  });

  describe('invitations', () => {
    it('adds the invited user with the invited role', async () => {
      const owner = await signUp(app);
      const workspaceId = await createWorkspace(owner);
      const viewer = await join(owner, workspaceId, 'VIEWER');

      const members = await owner.get(`/api/workspaces/${workspaceId}/members`).expect(200);
      expect(members.body).toEqual([
        expect.objectContaining({ userId: owner.id, role: 'OWNER' }),
        expect.objectContaining({ userId: viewer.id, email: viewer.email, role: 'VIEWER' }),
      ]);
      await owner
        .get(`/api/workspaces/${workspaceId}/invitations`)
        .expect(200)
        .expect(({ body }) => expect(body).toEqual([]));
    });

    it('enforces the role hierarchy when inviting', async () => {
      const owner = await signUp(app);
      const workspaceId = await createWorkspace(owner);
      const admin = await join(owner, workspaceId, 'ADMIN');
      const editor = await join(owner, workspaceId, 'EDITOR');

      await invite(editor, workspaceId, uniqueEmail(), 'VIEWER').expect(403);
      await invite(admin, workspaceId, uniqueEmail(), 'ADMIN').expect(403);
      await invite(owner, workspaceId, uniqueEmail(), 'OWNER').expect(400);
      await editor.get(`/api/workspaces/${workspaceId}/invitations`).expect(403);
    });

    it('accepts an invitation only for the invited email and only once', async () => {
      const owner = await signUp(app);
      const workspaceId = await createWorkspace(owner);
      const invited = await signUp(app);
      const other = await signUp(app);
      await invite(owner, workspaceId, invited.email, 'EDITOR').expect(201);
      const token = mail.tokenFor(invited.email);

      await other.post('/api/invitations/accept').send({ token }).expect(403);
      await invited.post('/api/invitations/accept').send({ token }).expect(200);
      await invited.post('/api/invitations/accept').send({ token }).expect(400);
    });

    it('rejects expired and revoked invitations', async () => {
      const owner = await signUp(app);
      const workspaceId = await createWorkspace(owner);
      const late = await signUp(app);
      const revoked = await signUp(app);

      await invite(owner, workspaceId, late.email, 'VIEWER').expect(201);
      await prisma.invitation.updateMany({
        where: { email: late.email },
        data: { createdAt: new Date(Date.now() - 3_600_000), expiresAt: new Date(Date.now() - 1) },
      });
      await late
        .post('/api/invitations/accept')
        .send({ token: mail.tokenFor(late.email) })
        .expect(400);

      const created = await invite(owner, workspaceId, revoked.email, 'VIEWER').expect(201);
      await owner
        .delete(`/api/workspaces/${workspaceId}/invitations/${created.body.id}`)
        .expect(204);
      await revoked
        .post('/api/invitations/accept')
        .send({ token: mail.tokenFor(revoked.email) })
        .expect(400);
    });

    it('replaces the previous invitation when inviting the same email again', async () => {
      const owner = await signUp(app);
      const workspaceId = await createWorkspace(owner);
      const invited = await signUp(app);

      await invite(owner, workspaceId, invited.email, 'VIEWER').expect(201);
      const firstToken = mail.tokenFor(invited.email);
      await invite(owner, workspaceId, invited.email.toUpperCase(), 'EDITOR').expect(201);

      await invited.post('/api/invitations/accept').send({ token: firstToken }).expect(400);
      await invited
        .post('/api/invitations/accept')
        .send({ token: mail.tokenFor(invited.email) })
        .expect(200);
      const details = await invited.get(`/api/workspaces/${workspaceId}`).expect(200);
      expect(details.body.role).toBe('EDITOR');
    });

    it('rejects inviting an existing member', async () => {
      const owner = await signUp(app);
      const workspaceId = await createWorkspace(owner);
      const member = await join(owner, workspaceId, 'VIEWER');

      await invite(owner, workspaceId, member.email, 'EDITOR').expect(409);
    });
  });

  describe('plan limits', () => {
    it('counts pending invitations against the member limit with a clear 402', async () => {
      const owner = await signUp(app);
      const workspaceId = await createWorkspace(owner);
      const first = uniqueEmail();
      await invite(owner, workspaceId, first, 'VIEWER').expect(201);
      await invite(owner, workspaceId, uniqueEmail(), 'VIEWER').expect(201);

      const res = await invite(owner, workspaceId, uniqueEmail(), 'VIEWER').expect(402);
      expect(res.body.message).toBe(
        'The Free plan allows up to 3 members. Upgrade the plan to add more.',
      );
      await invite(owner, workspaceId, first, 'EDITOR').expect(201);
    });

    it('does not exceed the limit under concurrent invitations', async () => {
      const owner = await signUp(app);
      const workspaceId = await createWorkspace(owner);

      const results = await Promise.all(
        Array.from({ length: 5 }, () => invite(owner, workspaceId, uniqueEmail(), 'VIEWER')),
      );

      expect(results.map((r) => r.status).sort()).toEqual([201, 201, 402, 402, 402]);
    });
  });

  describe('members', () => {
    it('lets the owner change roles within the hierarchy', async () => {
      const owner = await signUp(app);
      const workspaceId = await createWorkspace(owner);
      const admin = await join(owner, workspaceId, 'ADMIN');
      const viewer = await join(owner, workspaceId, 'VIEWER');

      await admin
        .patch(`/api/workspaces/${workspaceId}/members/${viewer.id}`)
        .send({ role: 'EDITOR' })
        .expect(204);
      await admin
        .patch(`/api/workspaces/${workspaceId}/members/${owner.id}`)
        .send({ role: 'VIEWER' })
        .expect(403);
      await owner
        .patch(`/api/workspaces/${workspaceId}/members/${admin.id}`)
        .send({ role: 'OWNER' })
        .expect(400);

      const members = await owner.get(`/api/workspaces/${workspaceId}/members`).expect(200);
      expect(members.body.find((m: { userId: string }) => m.userId === viewer.id).role).toBe(
        'EDITOR',
      );
    });

    it('lets members leave, managers remove lower roles, and keeps the owner', async () => {
      const owner = await signUp(app);
      const workspaceId = await createWorkspace(owner);
      const admin = await join(owner, workspaceId, 'ADMIN');
      const editor = await join(owner, workspaceId, 'EDITOR');

      await editor.delete(`/api/workspaces/${workspaceId}/members/${admin.id}`).expect(403);
      await admin.delete(`/api/workspaces/${workspaceId}/members/${owner.id}`).expect(403);
      await owner.delete(`/api/workspaces/${workspaceId}/members/${owner.id}`).expect(403);
      await admin.delete(`/api/workspaces/${workspaceId}/members/${editor.id}`).expect(204);
      await admin.delete(`/api/workspaces/${workspaceId}/members/${admin.id}`).expect(204);

      await admin.get(`/api/workspaces/${workspaceId}`).expect(404);
      const members = await owner.get(`/api/workspaces/${workspaceId}/members`).expect(200);
      expect(members.body).toHaveLength(1);
    });
  });
});
