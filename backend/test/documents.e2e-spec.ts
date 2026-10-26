import type { INestApplication } from '@nestjs/common';
import { MailService } from '../src/infra/mail/mail.service.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { CapturingMail, cleanupE2eData, createTestApp, signUp, type TestUser } from './helpers.js';

interface Node {
  id: string;
  parentId: string | null;
  title: string;
  position: string;
}

describe('Documents (e2e)', () => {
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

  const setup = async () => {
    const owner = await signUp(app);
    const res = await owner.post('/api/workspaces').send({ name: 'E2E docs' }).expect(201);
    return { owner, workspaceId: res.body.id as string };
  };

  const join = async (owner: TestUser, workspaceId: string, role: string) => {
    const member = await signUp(app);
    await owner
      .post(`/api/workspaces/${workspaceId}/invitations`)
      .send({ email: member.email, role })
      .expect(201);
    await member
      .post('/api/invitations/accept')
      .send({ token: mail.tokenFor(member.email) })
      .expect(200);
    return member;
  };

  const create = async (user: TestUser, workspaceId: string, body: object) => {
    const res = await user.post(`/api/workspaces/${workspaceId}/documents`).send(body).expect(201);
    return res.body.id as string;
  };

  const tree = async (user: TestUser, workspaceId: string) =>
    (await user.get(`/api/workspaces/${workspaceId}/documents`).expect(200)).body as Node[];

  const titlesUnder = (nodes: Node[], parentId: string | null) =>
    nodes
      .filter((node) => node.parentId === parentId)
      .sort((a, b) => (a.position < b.position ? -1 : 1))
      .map((node) => node.title);

  describe('ordering and nesting', () => {
    it('appends by default and inserts first or after a sibling', async () => {
      const { owner, workspaceId } = await setup();
      const b = await create(owner, workspaceId, { title: 'B' });
      await create(owner, workspaceId, { title: 'D' });
      await create(owner, workspaceId, { title: 'A', afterId: null });
      await create(owner, workspaceId, { title: 'C', afterId: b });

      expect(titlesUnder(await tree(owner, workspaceId), null)).toEqual(['A', 'B', 'C', 'D']);
    });

    it('nests documents and moves them between parents', async () => {
      const { owner, workspaceId } = await setup();
      const parent = await create(owner, workspaceId, { title: 'Parent' });
      const other = await create(owner, workspaceId, { title: 'Other' });
      const child = await create(owner, workspaceId, { title: 'Child', parentId: parent });

      await owner.post(`/api/documents/${child}/move`).send({ parentId: other }).expect(200);
      let nodes = await tree(owner, workspaceId);
      expect(titlesUnder(nodes, parent)).toEqual([]);
      expect(titlesUnder(nodes, other)).toEqual(['Child']);

      await owner
        .post(`/api/documents/${child}/move`)
        .send({ parentId: null, afterId: null })
        .expect(200);
      nodes = await tree(owner, workspaceId);
      expect(titlesUnder(nodes, null)).toEqual(['Child', 'Parent', 'Other']);
    });

    it('reorders within the same parent', async () => {
      const { owner, workspaceId } = await setup();
      const first = await create(owner, workspaceId, { title: '1' });
      await create(owner, workspaceId, { title: '2' });
      const third = await create(owner, workspaceId, { title: '3' });

      await owner
        .post(`/api/documents/${first}/move`)
        .send({ parentId: null, afterId: third })
        .expect(200);

      expect(titlesUnder(await tree(owner, workspaceId), null)).toEqual(['2', '3', '1']);
    });

    it('rejects moving a document inside itself or its descendant', async () => {
      const { owner, workspaceId } = await setup();
      const root = await create(owner, workspaceId, { title: 'Root' });
      const child = await create(owner, workspaceId, { title: 'Child', parentId: root });
      const grandchild = await create(owner, workspaceId, { title: 'GC', parentId: child });

      await owner.post(`/api/documents/${root}/move`).send({ parentId: root }).expect(400);
      await owner.post(`/api/documents/${root}/move`).send({ parentId: grandchild }).expect(400);
    });

    it('rejects an afterId that is not a sibling under the target parent', async () => {
      const { owner, workspaceId } = await setup();
      const parent = await create(owner, workspaceId, { title: 'Parent' });
      const child = await create(owner, workspaceId, { title: 'Child', parentId: parent });
      const doc = await create(owner, workspaceId, { title: 'Doc' });

      await owner
        .post(`/api/documents/${doc}/move`)
        .send({ parentId: null, afterId: child })
        .expect(400);
      await owner
        .post(`/api/workspaces/${workspaceId}/documents`)
        .send({ title: 'X', afterId: doc, parentId: parent })
        .expect(400);
    });

    it('rejects a parent from another workspace', async () => {
      const { owner, workspaceId } = await setup();
      const foreign = await setup();
      const foreignDoc = await create(foreign.owner, foreign.workspaceId, { title: 'Foreign' });
      const doc = await create(owner, workspaceId, { title: 'Mine' });

      await owner.post(`/api/documents/${doc}/move`).send({ parentId: foreignDoc }).expect(404);
      await owner
        .post(`/api/workspaces/${workspaceId}/documents`)
        .send({ parentId: foreignDoc })
        .expect(404);
    });

    it('keeps positions unique under concurrent creation', async () => {
      const { owner, workspaceId } = await setup();

      const results = await Promise.all(
        Array.from({ length: 8 }, (_, i) =>
          owner.post(`/api/workspaces/${workspaceId}/documents`).send({ title: `P${i}` }),
        ),
      );

      expect(results.every((r) => r.status === 201)).toBe(true);
      const positions = (await tree(owner, workspaceId)).map((node) => node.position);
      expect(new Set(positions).size).toBe(8);
    });
  });

  describe('deletion', () => {
    it('soft deletes the whole subtree', async () => {
      const { owner, workspaceId } = await setup();
      const root = await create(owner, workspaceId, { title: 'Root' });
      const child = await create(owner, workspaceId, { title: 'Child', parentId: root });
      await create(owner, workspaceId, { title: 'Keep' });

      await owner.delete(`/api/documents/${root}`).expect(204);

      expect(titlesUnder(await tree(owner, workspaceId), null)).toEqual(['Keep']);
      await owner.get(`/api/documents/${child}`).expect(404);
      await owner
        .post(`/api/workspaces/${workspaceId}/documents`)
        .send({ parentId: root })
        .expect(404);
      const stored = await prisma.document.findUniqueOrThrow({ where: { id: child } });
      expect(stored.deletedAt).not.toBeNull();
    });

    it('keeps a subtree with view-only subpages from an editor, but not from an admin', async () => {
      const { owner, workspaceId } = await setup();
      const editor = await join(owner, workspaceId, 'EDITOR');
      const root = await create(owner, workspaceId, { title: 'Root' });
      const locked = await create(owner, workspaceId, { title: 'Locked', parentId: root });
      await owner
        .put(`/api/documents/${locked}/permissions`)
        .send({ email: editor.email, accessLevel: 'VIEW' })
        .expect(204);

      await editor.delete(`/api/documents/${root}`).expect(403);
      await editor.get(`/api/documents/${locked}`).expect(200);

      await owner.delete(`/api/documents/${root}`).expect(204);
      await owner.get(`/api/documents/${locked}`).expect(404);
    });
  });

  describe('access', () => {
    it('workspace -> document -> invite viewer -> viewer cannot edit through the API', async () => {
      const { owner, workspaceId } = await setup();
      const doc = await create(owner, workspaceId, { title: 'Plan' });

      const viewer = await join(owner, workspaceId, 'VIEWER');

      await viewer.get(`/api/documents/${doc}`).expect(200);
      await viewer.patch(`/api/documents/${doc}`).send({ title: 'Changed' }).expect(403);
      await viewer.delete(`/api/documents/${doc}`).expect(403);
      const stored = await prisma.document.findUniqueOrThrow({ where: { id: doc } });
      expect(stored).toMatchObject({ title: 'Plan', deletedAt: null });
    });

    it('lets viewers read but not change documents, and hides them from strangers', async () => {
      const { owner, workspaceId } = await setup();
      const viewer = await join(owner, workspaceId, 'VIEWER');
      const stranger = await signUp(app);
      const doc = await create(owner, workspaceId, { title: 'Spec' });

      const res = await viewer.get(`/api/documents/${doc}`).expect(200);
      expect(res.body).toMatchObject({ title: 'Spec', access: 'VIEW' });
      await viewer.patch(`/api/documents/${doc}`).send({ title: 'Hacked' }).expect(403);
      await viewer.post(`/api/documents/${doc}/move`).send({ parentId: null }).expect(403);
      await viewer.delete(`/api/documents/${doc}`).expect(403);
      await viewer.post(`/api/workspaces/${workspaceId}/documents`).send({}).expect(403);

      await stranger.get(`/api/documents/${doc}`).expect(404);
      await stranger.patch(`/api/documents/${doc}`).send({ title: 'Hacked' }).expect(404);
      await stranger.get(`/api/workspaces/${workspaceId}/documents`).expect(404);
    });

    it('shares a page with an outsider including its subpages only', async () => {
      const { owner, workspaceId } = await setup();
      const guest = await signUp(app);
      const shared = await create(owner, workspaceId, { title: 'Shared' });
      const sub = await create(owner, workspaceId, { title: 'Sub', parentId: shared });
      const secret = await create(owner, workspaceId, { title: 'Secret' });

      await owner
        .put(`/api/documents/${shared}/permissions`)
        .send({ email: guest.email, accessLevel: 'VIEW' })
        .expect(204);

      await guest.get(`/api/documents/${shared}`).expect(200);
      const subRes = await guest.get(`/api/documents/${sub}`).expect(200);
      expect(subRes.body.access).toBe('VIEW');
      await guest.get(`/api/documents/${secret}`).expect(404);
      await guest.patch(`/api/documents/${sub}`).send({ title: 'No' }).expect(403);

      const list = await guest.get('/api/shared-documents').expect(200);
      expect(list.body).toEqual([
        expect.objectContaining({ id: shared, workspaceId, title: 'Shared', accessLevel: 'VIEW' }),
      ]);
      const memberList = await owner.get('/api/shared-documents').expect(200);
      expect(memberList.body).toEqual([]);

      await owner.delete(`/api/documents/${shared}/permissions/${guest.id}`).expect(204);
      await guest.get(`/api/documents/${shared}`).expect(404);
      expect((await guest.get('/api/shared-documents').expect(200)).body).toEqual([]);
    });

    it('drops the document grants of a removed member', async () => {
      const { owner, workspaceId } = await setup();
      const member = await join(owner, workspaceId, 'VIEWER');
      const doc = await create(owner, workspaceId, { title: 'Doc' });
      await owner
        .put(`/api/documents/${doc}/permissions`)
        .send({ email: member.email, accessLevel: 'EDIT' })
        .expect(204);

      await owner.delete(`/api/workspaces/${workspaceId}/members/${member.id}`).expect(204);

      await member.get(`/api/documents/${doc}`).expect(404);
      expect(await prisma.documentPermission.count({ where: { userId: member.id } })).toBe(0);
    });

    it('lets a document grant override the workspace role in both directions', async () => {
      const { owner, workspaceId } = await setup();
      const viewer = await join(owner, workspaceId, 'VIEWER');
      const editor = await join(owner, workspaceId, 'EDITOR');
      const doc = await create(owner, workspaceId, { title: 'Doc' });
      const share = (email: string, accessLevel: string) =>
        owner.put(`/api/documents/${doc}/permissions`).send({ email, accessLevel }).expect(204);

      await share(viewer.email, 'EDIT');
      await share(editor.email, 'VIEW');

      await viewer.patch(`/api/documents/${doc}`).send({ title: 'By viewer' }).expect(200);
      await editor.patch(`/api/documents/${doc}`).send({ title: 'By editor' }).expect(403);
      await editor.get(`/api/documents/${doc}/permissions`).expect(403);

      const permissions = await owner.get(`/api/documents/${doc}/permissions`).expect(200);
      expect(permissions.body).toHaveLength(2);
    });

    it('rejects sharing with an unknown email', async () => {
      const { owner, workspaceId } = await setup();
      const doc = await create(owner, workspaceId, { title: 'Doc' });

      await owner
        .put(`/api/documents/${doc}/permissions`)
        .send({ email: 'nobody@e2e.test', accessLevel: 'VIEW' })
        .expect(404);
    });
  });

  describe('plan limits and cache', () => {
    it('stops at the document limit of the plan with a 402', async () => {
      const { owner, workspaceId } = await setup();
      await prisma.document.createMany({
        data: Array.from({ length: 100 }, (_, i) => ({
          workspaceId,
          title: `Bulk ${i}`,
          position: `a${String(i).padStart(3, '0')}`,
        })),
      });

      const res = await owner.post(`/api/workspaces/${workspaceId}/documents`).send({}).expect(402);
      expect(res.body.message).toBe(
        'The Free plan allows up to 100 documents. Upgrade the plan to add more.',
      );
    });

    it('serves fresh data after changes', async () => {
      const { owner, workspaceId } = await setup();
      const doc = await create(owner, workspaceId, { title: 'Before' });
      expect(titlesUnder(await tree(owner, workspaceId), null)).toEqual(['Before']);

      await owner.patch(`/api/documents/${doc}`).send({ title: 'After' }).expect(200);
      expect(titlesUnder(await tree(owner, workspaceId), null)).toEqual(['After']);

      await owner.delete(`/api/documents/${doc}`).expect(204);
      expect(await tree(owner, workspaceId)).toEqual([]);
    });
  });
});
