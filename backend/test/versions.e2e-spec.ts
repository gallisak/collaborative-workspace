import type { INestApplication } from '@nestjs/common';
import * as Y from 'yjs';
import { MailService } from '../src/infra/mail/mail.service.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { CONTENT_FIELD } from '../src/modules/collab/document-content.js';
import { eventually, startCollab } from './collab-harness.js';
import { CapturingMail, cleanupE2eData, createTestApp, signUp, type TestUser } from './helpers.js';

interface Version {
  id: string;
  kind: 'AUTO' | 'MANUAL';
  name: string | null;
  createdBy: { id: string } | null;
}

const write = (doc: Y.Doc, text: string) => {
  const fragment = doc.getXmlFragment(CONTENT_FIELD);
  doc.transact(() => {
    fragment.delete(0, fragment.length);
    const paragraph = new Y.XmlElement('paragraph');
    paragraph.insert(0, [new Y.XmlText(text)]);
    fragment.insert(0, [paragraph]);
  });
};

const read = (doc: Y.Doc) => doc.getXmlFragment(CONTENT_FIELD).toJSON();
const paragraph = (text: string) => `<paragraph>${text}</paragraph>`;

const fromState = (state: Uint8Array) => {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, state);
  return read(doc);
};

describe('Versions (e2e)', () => {
  let api: INestApplication;
  let collab: INestApplication;
  let prisma: PrismaService;
  let connect: Awaited<ReturnType<typeof startCollab>>['connect'];
  let disconnectAll: () => void;
  const mail = new CapturingMail();

  beforeAll(async () => {
    ({ app: api, prisma } = await createTestApp({
      overrides: [{ token: MailService, value: mail }],
    }));
    ({ app: collab, connect, disconnectAll } = await startCollab());
  });

  afterEach(() => disconnectAll());

  afterAll(async () => {
    await collab.close();
    await cleanupE2eData(prisma);
    await api.close();
  });

  const setup = async () => {
    const owner = await signUp(api);
    const workspace = await owner
      .post('/api/workspaces')
      .send({ name: 'E2E versions' })
      .expect(201);
    const document = await owner
      .post(`/api/workspaces/${workspace.body.id}/documents`)
      .send({ title: 'Versioned' })
      .expect(201);
    return {
      owner,
      workspaceId: workspace.body.id as string,
      documentId: document.body.id as string,
    };
  };

  const versions = async (user: TestUser, documentId: string) =>
    (await user.get(`/api/documents/${documentId}/versions`).expect(200)).body as Version[];

  const versionContent = async (user: TestUser, documentId: string, versionId: string) => {
    const res = await user.get(`/api/documents/${documentId}/versions/${versionId}`).expect(200);
    return fromState(Buffer.from(res.body.state as string, 'base64'));
  };

  const storedContent = async (documentId: string) => {
    const state = await prisma.documentState.findUnique({ where: { documentId } });
    const updates = await prisma.documentUpdate.findMany({
      where: { documentId },
      orderBy: { id: 'asc' },
    });
    const doc = new Y.Doc();
    [state?.state, ...updates.map((u) => u.data)]
      .filter((data): data is Uint8Array<ArrayBuffer> => data !== undefined)
      .forEach((data) => Y.applyUpdate(doc, data));
    return read(doc);
  };

  it('saves a named version and restores it live for everyone in the document', async () => {
    const { owner, documentId } = await setup();
    const client = connect(documentId, { cookies: owner.cookies });
    await client.synced;
    write(client.doc, 'v1');
    await eventually(async () => (await storedContent(documentId)) === paragraph('v1'));

    await owner.post(`/api/documents/${documentId}/versions`).send({ name: 'First' }).expect(202);
    await eventually(async () =>
      (await versions(owner, documentId)).some((v) => v.name === 'First'),
    );
    const saved = (await versions(owner, documentId)).find((v) => v.name === 'First')!;
    expect(saved).toMatchObject({ kind: 'MANUAL', createdBy: { id: owner.id } });
    expect(await versionContent(owner, documentId, saved.id)).toBe(paragraph('v1'));

    write(client.doc, 'v2');
    await owner.post(`/api/documents/${documentId}/versions/${saved.id}/restore`).expect(202);

    await eventually(() => read(client.doc) === paragraph('v1'));
    await eventually(async () => (await storedContent(documentId)) === paragraph('v1'));
    const backup = (await versions(owner, documentId)).find((v) => v.name === 'Before restore')!;
    expect(backup).toMatchObject({ kind: 'MANUAL', createdBy: { id: owner.id } });
    expect(await versionContent(owner, documentId, backup.id)).toBe(paragraph('v2'));
  });

  it('restores a document nobody has open', async () => {
    const { owner, documentId } = await setup();
    const session = connect(documentId, { cookies: owner.cookies });
    await session.synced;
    write(session.doc, 'kept');
    await owner.post(`/api/documents/${documentId}/versions`).send({ name: 'Keep' }).expect(202);
    await eventually(async () =>
      (await versions(owner, documentId)).some((v) => v.name === 'Keep'),
    );
    write(session.doc, 'lost');
    session.provider.destroy();
    await eventually(async () => (await storedContent(documentId)) === paragraph('lost'));

    const keep = (await versions(owner, documentId)).find((v) => v.name === 'Keep')!;
    await owner.post(`/api/documents/${documentId}/versions/${keep.id}/restore`).expect(202);

    await eventually(async () => (await storedContent(documentId)) === paragraph('kept'));
    const reopened = connect(documentId, { cookies: owner.cookies });
    await reopened.synced;
    expect(read(reopened.doc)).toBe(paragraph('kept'));
  });

  it('takes automatic versions periodically and when the session ends', async () => {
    const { owner, documentId } = await setup();
    const client = connect(documentId, { cookies: owner.cookies });
    await client.synced;

    write(client.doc, 'draft');
    await new Promise((resolve) => setTimeout(resolve, 500));
    write(client.doc, 'draft 2');
    await eventually(async () =>
      (await versions(owner, documentId)).some((v) => v.kind === 'AUTO'),
    );

    write(client.doc, 'final');
    client.provider.destroy();
    await eventually(async () => {
      const auto = (await versions(owner, documentId)).filter((v) => v.kind === 'AUTO');
      return (await versionContent(owner, documentId, auto[0].id)) === paragraph('final');
    });
  });

  it('lets viewers browse versions but not create or restore them', async () => {
    const { owner, workspaceId, documentId } = await setup();
    const viewer = await signUp(api);
    const stranger = await signUp(api);
    await owner
      .post(`/api/workspaces/${workspaceId}/invitations`)
      .send({ email: viewer.email, role: 'VIEWER' })
      .expect(201);
    await viewer
      .post('/api/invitations/accept')
      .send({ token: mail.tokenFor(viewer.email) })
      .expect(200);
    const session = connect(documentId, { cookies: owner.cookies });
    await session.synced;
    write(session.doc, 'content');
    await owner.post(`/api/documents/${documentId}/versions`).send({}).expect(202);
    await eventually(async () => (await versions(owner, documentId)).length > 0);
    const [version] = await versions(owner, documentId);

    await viewer.get(`/api/documents/${documentId}/versions`).expect(200);
    await viewer.get(`/api/documents/${documentId}/versions/${version.id}`).expect(200);
    await viewer.post(`/api/documents/${documentId}/versions`).send({}).expect(403);
    await viewer.post(`/api/documents/${documentId}/versions/${version.id}/restore`).expect(403);
    await stranger.get(`/api/documents/${documentId}/versions`).expect(404);
    await owner
      .post(`/api/documents/${documentId}/versions/00000000-0000-7000-8000-000000000000/restore`)
      .expect(404);
  });
});
