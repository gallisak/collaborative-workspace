import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as Y from 'yjs';
import { MailService } from '../src/infra/mail/mail.service.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { CONTENT_FIELD } from '../src/modules/collab/document-content.js';
import { RevalidationClient } from '../src/modules/publishing/revalidation.client.js';
import { eventually, startCollab } from './collab-harness.js';
import {
  CapturingMail,
  cleanupE2eData,
  createTestApp,
  signUp,
  startWorker,
  type TestUser,
} from './helpers.js';

class CapturingRevalidation {
  readonly documentIds: string[] = [];

  revalidate(documentId: string) {
    this.documentIds.push(documentId);
    return Promise.resolve();
  }

  count(documentId: string) {
    return this.documentIds.filter((id) => id === documentId).length;
  }
}

const paragraph = (children: Y.XmlText[]) => {
  const element = new Y.XmlElement('paragraph');
  element.insert(0, children);
  return element;
};

const text = (value: string, attributes?: Record<string, unknown>) => {
  const node = new Y.XmlText();
  node.insert(0, value, attributes);
  return node;
};

const replaceContent = (doc: Y.Doc, ...nodes: Y.XmlElement[]) => {
  const fragment = doc.getXmlFragment(CONTENT_FIELD);
  doc.transact(() => {
    fragment.delete(0, fragment.length);
    fragment.insert(0, nodes);
  });
};

const write = (doc: Y.Doc, value: string) => replaceContent(doc, paragraph([text(value)]));
const read = (doc: Y.Doc) => doc.getXmlFragment(CONTENT_FIELD).toJSON();

describe('Publishing (e2e)', () => {
  let app: INestApplication;
  let collab: INestApplication;
  let worker: INestApplication;
  let prisma: PrismaService;
  let connect: Awaited<ReturnType<typeof startCollab>>['connect'];
  let disconnectAll: () => void;
  const mail = new CapturingMail();
  const revalidation = new CapturingRevalidation();

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp({ overrides: [{ token: MailService, value: mail }] }));
    ({ app: collab, connect, disconnectAll } = await startCollab());
    worker = await startWorker({ overrides: [{ token: RevalidationClient, value: revalidation }] });
  });

  afterEach(() => disconnectAll());

  afterAll(async () => {
    await worker.close();
    await collab.close();
    await cleanupE2eData(prisma);
    await app.close();
  });

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

  const setup = async () => {
    const owner = await signUp(app);
    const workspace = await owner.post('/api/workspaces').send({ name: 'E2E publish' }).expect(201);
    const workspaceId = workspace.body.id as string;
    const doc = await owner
      .post(`/api/workspaces/${workspaceId}/documents`)
      .send({ title: 'Launch notes' })
      .expect(201);
    return { owner, workspaceId, documentId: doc.body.id as string };
  };

  const publish = async (owner: TestUser, documentId: string, body: object = {}) => {
    const res = await owner
      .post(`/api/documents/${documentId}/share-links`)
      .send({ accessLevel: 'VIEW', ...body })
      .expect(201);
    return res.body as { id: string; token: string };
  };

  const visit = (token: string) =>
    request(app.getHttpServer()).get(`/api/public/documents/${token}`);

  const publicText = async (token: string) => {
    const res = await visit(token);
    return res.status === 200 ? JSON.stringify(res.body.blocks) : `status ${res.status}`;
  };

  const persisted = (documentId: string) =>
    eventually(async () => (await prisma.documentUpdate.count({ where: { documentId } })) > 0);

  it('serves a published page to anonymous visitors with sanitized content', async () => {
    const { owner, documentId } = await setup();
    const editor = connect(documentId, { cookies: owner.cookies });
    await editor.synced;
    const script = new Y.XmlElement('script');
    script.insert(0, [text('alert(1)')]);
    replaceContent(
      editor.doc,
      paragraph([
        text('Read the '),
        text('guide', { link: { href: 'https://example.com/guide' } }),
        text(' or '),
        text('this', { link: { href: 'javascript:alert(1)' } }),
      ]),
      script,
    );
    await persisted(documentId);
    const { token } = await publish(owner, documentId);

    const res = await visit(token).expect(200);

    expect(res.body).toEqual({
      id: documentId,
      title: 'Launch notes',
      description: 'Read the guide or this',
      accessLevel: 'VIEW',
      blocks: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Read the ' },
            {
              type: 'text',
              text: 'guide',
              marks: [{ type: 'link', href: 'https://example.com/guide' }],
            },
            { type: 'text', text: ' or ' },
            { type: 'text', text: 'this' },
          ],
        },
      ],
    });
    await visit('not-a-real-token').expect(404);
  });

  it('refreshes the public page after edits and asks the frontend to revalidate', async () => {
    const { owner, workspaceId, documentId } = await setup();
    const unpublished = await owner
      .post(`/api/workspaces/${workspaceId}/documents`)
      .send({ title: 'Draft' })
      .expect(201);
    const { token } = await publish(owner, documentId);
    const client = connect(documentId, { cookies: owner.cookies });
    const draft = connect(unpublished.body.id as string, { cookies: owner.cookies });
    await Promise.all([client.synced, draft.synced]);

    write(client.doc, 'first version');
    write(draft.doc, 'not public');
    await eventually(() => revalidation.count(documentId) === 1);
    expect(await publicText(token)).toContain('first version');

    write(client.doc, 'second version');
    await eventually(() => revalidation.count(documentId) === 2);
    expect(await publicText(token)).toContain('second version');
    expect(revalidation.count(unpublished.body.id as string)).toBe(0);
  });

  it('revalidates at most once per window while someone keeps typing', async () => {
    const { owner, documentId } = await setup();
    await publish(owner, documentId);
    const client = connect(documentId, { cookies: owner.cookies });
    await client.synced;

    for (let i = 0; i < 5; i++) {
      write(client.doc, `burst ${i}`);
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
    await eventually(() => revalidation.count(documentId) >= 1);
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(revalidation.count(documentId)).toBeLessThanOrEqual(2);
  });

  it('lets only managers publish and list links', async () => {
    const { owner, workspaceId, documentId } = await setup();
    const editor = await join(owner, workspaceId, 'EDITOR');
    const stranger = await signUp(app);

    await editor
      .post(`/api/documents/${documentId}/share-links`)
      .send({ accessLevel: 'VIEW' })
      .expect(403);
    await editor.get(`/api/documents/${documentId}/share-links`).expect(403);
    await stranger
      .post(`/api/documents/${documentId}/share-links`)
      .send({ accessLevel: 'VIEW' })
      .expect(404);
    const { id } = await publish(owner, documentId);
    await editor.delete(`/api/share-links/${id}`).expect(403);
    await owner
      .post(`/api/documents/${documentId}/share-links`)
      .send({ accessLevel: 'VIEW', expiresAt: new Date(Date.now() - 1000).toISOString() })
      .expect(400);
  });

  it('stops serving expired and revoked links', async () => {
    const { owner, documentId } = await setup();
    const expiring = await publish(owner, documentId, {
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const revoked = await publish(owner, documentId);
    await visit(expiring.token).expect(200);

    await prisma.shareLink.update({
      where: { id: expiring.id },
      data: { createdAt: new Date(Date.now() - 60_000), expiresAt: new Date(Date.now() - 1000) },
    });
    await visit(expiring.token).expect(404);

    const before = revalidation.count(documentId);
    await owner.delete(`/api/share-links/${revoked.id}`).expect(204);
    await visit(revoked.token).expect(404);
    await eventually(() => revalidation.count(documentId) > before);

    const links = await owner.get(`/api/documents/${documentId}/share-links`).expect(200);
    expect(links.body).toEqual([]);
  });

  it('takes the page down and revalidates when the document is deleted', async () => {
    const { owner, documentId } = await setup();
    const { token } = await publish(owner, documentId);

    await owner.delete(`/api/documents/${documentId}`).expect(204);

    await visit(token).expect(404);
    await eventually(() => revalidation.count(documentId) >= 1);
  });

  it('rate limits link creation per user', async () => {
    const { owner, documentId } = await setup();
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await owner
        .post(`/api/documents/${documentId}/share-links`)
        .send({ accessLevel: 'VIEW' });
      statuses.push(res.status);
    }

    expect(statuses.slice(0, 10).every((status) => status === 201)).toBe(true);
    expect(statuses[10]).toBe(429);
    const other = await setup();
    await publish(other.owner, other.documentId);
  });

  describe('editing by link', () => {
    it('lets a signed in outsider edit with an edit link and only read with a view link', async () => {
      const { owner, documentId } = await setup();
      const outsider = await signUp(app);
      const editLink = await publish(owner, documentId, { accessLevel: 'EDIT' });
      const viewLink = await publish(owner, documentId);
      const ownerClient = connect(documentId, { cookies: owner.cookies });
      const editorClient = connect(documentId, {
        cookies: outsider.cookies,
        share: editLink.token,
      });
      await Promise.all([ownerClient.synced, editorClient.synced]);

      write(editorClient.doc, 'edited by link');
      await eventually(() => read(ownerClient.doc).includes('edited by link'));

      const viewerClient = connect(documentId, {
        cookies: outsider.cookies,
        share: viewLink.token,
      });
      await viewerClient.synced;
      write(viewerClient.doc, 'should not apply');
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(read(ownerClient.doc)).toContain('edited by link');
    });

    it('rejects collaborators without a link and closes sessions when the link is revoked', async () => {
      const { owner, documentId } = await setup();
      const outsider = await signUp(app);
      const link = await publish(owner, documentId, { accessLevel: 'EDIT' });

      const rejected = connect(documentId, { cookies: outsider.cookies });
      expect(await rejected.closedWith).toBe(4404);

      const session = connect(documentId, { cookies: outsider.cookies, share: link.token });
      await session.synced;
      await owner.delete(`/api/share-links/${link.id}`).expect(204);
      expect(await session.closedWith).toBe(4404);
    });

    it('closes the session when the link expires', async () => {
      const { owner, documentId } = await setup();
      const outsider = await signUp(app);
      const link = await publish(owner, documentId, {
        accessLevel: 'EDIT',
        expiresAt: new Date(Date.now() + 1500).toISOString(),
      });

      const session = connect(documentId, { cookies: outsider.cookies, share: link.token });
      await session.synced;

      expect(await session.closedWith).toBe(4404);
    });
  });
});
