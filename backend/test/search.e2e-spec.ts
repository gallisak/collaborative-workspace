import type { INestApplication } from '@nestjs/common';
import type { Job } from 'bullmq';
import * as Y from 'yjs';
import { MailService } from '../src/infra/mail/mail.service.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { SearchJob } from '../src/infra/queue/search-jobs.js';
import { CONTENT_FIELD } from '../src/modules/collab/document-content.js';
import { SearchIndexProcessor } from '../src/modules/search/search-index.processor.js';
import { SearchRepository } from '../src/modules/search/search.repository.js';
import { eventually, startCollab } from './collab-harness.js';
import {
  CapturingMail,
  cleanupE2eData,
  createTestApp,
  signUp,
  startWorker,
  type TestUser,
} from './helpers.js';

interface Hit {
  id: string;
  title: string;
  snippet: string;
}

const write = (doc: Y.Doc, value: string) => {
  const fragment = doc.getXmlFragment(CONTENT_FIELD);
  doc.transact(() => {
    fragment.delete(0, fragment.length);
    const paragraph = new Y.XmlElement('paragraph');
    paragraph.insert(0, [new Y.XmlText(value)]);
    fragment.insert(0, [paragraph]);
  });
};

describe('Search (e2e)', () => {
  let app: INestApplication;
  let collab: INestApplication;
  let worker: INestApplication;
  let prisma: PrismaService;
  let connect: Awaited<ReturnType<typeof startCollab>>['connect'];
  let disconnectAll: () => void;
  const mail = new CapturingMail();

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp({ overrides: [{ token: MailService, value: mail }] }));
    ({ app: collab, connect, disconnectAll } = await startCollab());
    worker = await startWorker();
  });

  afterEach(() => disconnectAll());

  afterAll(async () => {
    await worker.close();
    await collab.close();
    await cleanupE2eData(prisma);
    await app.close();
  });

  const setup = async () => {
    const owner = await signUp(app);
    const workspace = await owner.post('/api/workspaces').send({ name: 'E2E search' }).expect(201);
    return { owner, workspaceId: workspace.body.id as string };
  };

  const create = async (user: TestUser, workspaceId: string, body: object) => {
    const res = await user.post(`/api/workspaces/${workspaceId}/documents`).send(body).expect(201);
    return res.body.id as string;
  };

  const search = async (user: TestUser, workspaceId: string, q: string) => {
    const res = await user.get(`/api/workspaces/${workspaceId}/search`).query({ q }).expect(200);
    return res.body as Hit[];
  };

  const ids = async (user: TestUser, workspaceId: string, q: string) =>
    (await search(user, workspaceId, q)).map((hit) => hit.id).sort();

  const indexed = (documentId: string, text: string) =>
    eventually(async () => {
      const row = await prisma.documentSearch.findUnique({ where: { documentId } });
      return row?.content.includes(text) ?? false;
    });

  const typeInto = async (owner: TestUser, documentId: string, value: string) => {
    const client = connect(documentId, { cookies: owner.cookies });
    await client.synced;
    write(client.doc, value);
    await indexed(documentId, value);
  };

  it('finds documents by words of their content and title once the worker indexed them', async () => {
    const { owner, workspaceId } = await setup();
    const roadmap = await create(owner, workspaceId, { title: 'Quarterly roadmap' });
    await create(owner, workspaceId, { title: 'Unrelated' });

    await typeInto(owner, roadmap, 'Запуск ракети у четвертому кварталі');

    const [hit] = await search(owner, workspaceId, 'ракет');
    expect(hit).toMatchObject({ id: roadmap, title: 'Quarterly roadmap' });
    expect(hit.snippet).toContain('Запуск ракети');
    expect(await ids(owner, workspaceId, 'quart')).toEqual([roadmap]);
    expect(await ids(owner, workspaceId, 'roadmap ракети')).toEqual([roadmap]);
    expect(await ids(owner, workspaceId, 'roadmap missing')).toEqual([]);
    expect(await search(owner, workspaceId, '!!!')).toEqual([]);
    await owner.get(`/api/workspaces/${workspaceId}/search`).query({ q: '' }).expect(400);
  });

  it('shows only documents the user can open', async () => {
    const { owner, workspaceId } = await setup();
    const guest = await signUp(app);
    const stranger = await signUp(app);
    const shared = await create(owner, workspaceId, { title: 'Shared plan' });
    const child = await create(owner, workspaceId, { title: 'Child plan', parentId: shared });
    const secret = await create(owner, workspaceId, { title: 'Secret plan' });
    await Promise.all([shared, child, secret].map((id) => indexed(id, '')));
    await owner
      .put(`/api/documents/${shared}/permissions`)
      .send({ email: guest.email, accessLevel: 'VIEW' })
      .expect(204);

    expect(await ids(owner, workspaceId, 'plan')).toEqual([shared, child, secret].sort());
    expect(await ids(guest, workspaceId, 'plan')).toEqual([shared, child].sort());
    await stranger.get(`/api/workspaces/${workspaceId}/search`).query({ q: 'plan' }).expect(404);
  });

  it('reflects renames and deletions', async () => {
    const { owner, workspaceId } = await setup();
    const doc = await create(owner, workspaceId, { title: 'Draft' });
    await indexed(doc, '');

    await owner.patch(`/api/documents/${doc}`).send({ title: 'Budget' }).expect(200);
    await eventually(async () => (await ids(owner, workspaceId, 'budget')).length === 1);

    await owner.delete(`/api/documents/${doc}`).expect(204);
    expect(await ids(owner, workspaceId, 'budget')).toEqual([]);
  });

  it('never lets an older indexing result overwrite a newer one', async () => {
    const { owner, workspaceId } = await setup();
    const doc = await create(owner, workspaceId, { title: 'Notes' });
    await typeInto(owner, doc, 'fresh content');

    const written = await worker.get(SearchRepository).upsert(doc, 'Notes', 'stale content', 0n);

    expect(written).toBe(0);
    expect(await ids(owner, workspaceId, 'fresh')).toEqual([doc]);
    expect(await ids(owner, workspaceId, 'stale')).toEqual([]);
  });

  it('is idempotent when the same job runs again', async () => {
    const { owner, workspaceId } = await setup();
    const doc = await create(owner, workspaceId, { title: 'Again' });
    await typeInto(owner, doc, 'repeatable');
    const processor = worker.get(SearchIndexProcessor);

    await processor.index(doc);
    await processor.index(doc);

    expect(await ids(owner, workspaceId, 'repeatable')).toEqual([doc]);
  });

  it('repairs missing index entries on reconciliation', async () => {
    const { owner, workspaceId } = await setup();
    const doc = await create(owner, workspaceId, { title: 'Recovered' });
    await indexed(doc, '');
    await prisma.documentSearch.delete({ where: { documentId: doc } });
    expect(await ids(owner, workspaceId, 'recovered')).toEqual([]);

    await worker.get(SearchIndexProcessor).process({ name: SearchJob.Reconcile } as Job);

    await eventually(async () => (await ids(owner, workspaceId, 'recovered')).length === 1);
  });
});
