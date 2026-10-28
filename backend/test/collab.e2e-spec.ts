import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import * as Y from 'yjs';
import { MailService } from '../src/infra/mail/mail.service.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { RoomsService } from '../src/modules/collab/rooms.service.js';
import { CapturingMail, cleanupE2eData, createTestApp, signUp, type TestUser } from './helpers.js';
import { eventually, startCollab } from './collab-harness.js';

const text = (doc: Y.Doc) => doc.getText('body').toJSON();

describe('Collab gateway (e2e)', () => {
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

  const join = async (owner: TestUser, workspaceId: string, role: string) => {
    const member = await signUp(api);
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
    const owner = await signUp(api);
    const workspace = await owner.post('/api/workspaces').send({ name: 'E2E collab' }).expect(201);
    const workspaceId = workspace.body.id as string;
    const document = await owner
      .post(`/api/workspaces/${workspaceId}/documents`)
      .send({ title: 'Shared doc' })
      .expect(201);
    return { owner, workspaceId, documentId: document.body.id as string };
  };

  const storedText = async (documentId: string) => {
    const state = await prisma.documentState.findUnique({ where: { documentId } });
    const updates = await prisma.documentUpdate.findMany({
      where: { documentId, id: { gt: state?.lastUpdateId ?? 0n } },
      orderBy: { id: 'asc' },
    });
    const doc = new Y.Doc();
    [state?.state, ...updates.map((u) => u.data)]
      .filter((data): data is Uint8Array<ArrayBuffer> => data !== undefined)
      .forEach((data) => Y.applyUpdate(doc, data));
    return text(doc);
  };

  it('merges concurrent edits from two clients without losing any change', async () => {
    const { owner, workspaceId, documentId } = await setup();
    const editor = await join(owner, workspaceId, 'EDITOR');
    const a = connect(documentId, { cookies: owner.cookies });
    const b = connect(documentId, { cookies: editor.cookies });
    await Promise.all([a.synced, b.synced]);

    a.doc.getText('body').insert(0, 'Hello');
    b.doc.getText('body').insert(0, 'World');
    for (let i = 0; i < 20; i++) {
      a.doc.getText('body').insert(text(a.doc).length, 'a');
      b.doc.getText('body').insert(0, 'b');
    }

    await eventually(() => text(a.doc) === text(b.doc) && text(a.doc).length === 50);
    expect(text(a.doc)).toContain('Hello');
    expect(text(a.doc)).toContain('World');
    await eventually(async () => (await storedText(documentId)) === text(a.doc));
  });

  it('restores the document for a new session after everyone left', async () => {
    const { owner, documentId } = await setup();
    const first = connect(documentId, { cookies: owner.cookies });
    await first.synced;
    first.doc.getText('body').insert(0, 'Persisted across sessions');
    await eventually(async () => (await storedText(documentId)) === 'Persisted across sessions');
    first.provider.destroy();

    await eventually(async () =>
      Boolean(await prisma.documentState.findUnique({ where: { documentId } })),
    );
    const second = connect(documentId, { cookies: owner.cookies });
    await second.synced;

    expect(text(second.doc)).toBe('Persisted across sessions');
  });

  it('saves buffered edits and tells clients to reconnect when the gateway shuts down', async () => {
    const { owner, documentId } = await setup();
    const gateway = await startCollab();
    const client = gateway.connect(documentId, { cookies: owner.cookies });
    await client.synced;
    const closeCode = new Promise<number | undefined>((resolve) =>
      client.provider.on('connection-close', (event) => resolve(event?.code)),
    );

    client.doc.getText('body').insert(0, 'Written right before a restart');
    await eventually(() => gateway.app.get(RoomsService).stats().rooms === 1);
    await new Promise((resolve) => setTimeout(resolve, 10));
    const stopped = gateway.app.close().then(() => 'stopped');
    const timeout = new Promise((resolve) => setTimeout(() => resolve('timeout'), 5000));

    expect(await Promise.race([stopped, timeout])).toBe('stopped');
    expect(await closeCode).toBe(1012);
    gateway.disconnectAll();
    expect(await storedText(documentId)).toBe('Written right before a restart');
  });

  it('compacts the update log into a snapshot', async () => {
    const { owner, documentId } = await setup();
    const client = connect(documentId, { cookies: owner.cookies });
    await client.synced;

    for (let i = 0; i < 6; i++) {
      client.doc.getText('body').insert(text(client.doc).length, `${i}`);
      await new Promise((resolve) => setTimeout(resolve, 80));
    }

    await eventually(async () => (await storedText(documentId)) === '012345');
    const state = await prisma.documentState.findUnique({ where: { documentId } });
    const leftover = await prisma.documentUpdate.count({ where: { documentId } });
    expect(state).not.toBeNull();
    expect(leftover).toBeLessThan(3);
  });

  it('lets a viewer follow edits live but ignores their own edits', async () => {
    const { owner, workspaceId, documentId } = await setup();
    const viewer = await join(owner, workspaceId, 'VIEWER');
    const editorClient = connect(documentId, { cookies: owner.cookies });
    await editorClient.synced;
    editorClient.doc.getText('body').insert(0, 'Original');

    const viewerClient = connect(documentId, { cookies: viewer.cookies });
    await viewerClient.synced;
    await eventually(() => text(viewerClient.doc) === 'Original');

    viewerClient.doc.getText('body').insert(0, 'HACKED ');
    editorClient.doc.getText('body').insert(text(editorClient.doc).length, ' + live');

    await eventually(() => text(viewerClient.doc).endsWith(' + live'));
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(text(editorClient.doc)).toBe('Original + live');
    expect(await storedText(documentId)).toBe('Original + live');
  });

  it('rejects connections without session, from foreign origins or without access', async () => {
    const { documentId } = await setup();
    const stranger = await signUp(api);

    expect(await connect(documentId, {}).closedWith).toBe(4401);
    expect(
      await connect(documentId, { cookies: stranger.cookies, origin: 'https://evil.example' })
        .closedWith,
    ).toBe(4403);
    expect(await connect(documentId, { cookies: stranger.cookies }).closedWith).toBe(4404);
    expect(await connect('not-a-uuid', { cookies: stranger.cookies }).closedWith).toBe(4404);
  });

  it('shows presence with the authenticated identity, not the claimed one', async () => {
    const { owner, workspaceId, documentId } = await setup();
    const editor = await join(owner, workspaceId, 'EDITOR');
    const a = connect(documentId, { cookies: owner.cookies });
    const b = connect(documentId, { cookies: editor.cookies });
    await Promise.all([a.synced, b.synced]);

    a.provider.awareness.setLocalStateField('user', {
      id: 'fake',
      name: 'Impostor',
      color: '#f00',
    });

    await eventually(() => b.provider.awareness.getStates().has(a.doc.clientID));
    const seen = b.provider.awareness.getStates().get(a.doc.clientID) as {
      user: { id: string; color: string };
    };
    expect(seen.user).toMatchObject({ id: owner.id, color: '#f00' });
    expect(seen.user).not.toMatchObject({ name: 'Impostor' });
  });

  it('closes sessions when the document is deleted while being edited', async () => {
    const { owner, documentId } = await setup();
    const client = connect(documentId, { cookies: owner.cookies });
    await client.synced;

    await owner.delete(`/api/documents/${documentId}`).expect(204);

    expect(await client.closedWith).toBe(4404);
  });

  it('applies access changes to live sessions', async () => {
    const { owner, workspaceId, documentId } = await setup();
    const editor = await join(owner, workspaceId, 'EDITOR');
    const removed = await join(owner, workspaceId, 'VIEWER');
    const editorClient = connect(documentId, { cookies: editor.cookies });
    const removedClient = connect(documentId, { cookies: removed.cookies });
    await Promise.all([editorClient.synced, removedClient.synced]);

    await owner
      .put(`/api/documents/${documentId}/permissions`)
      .send({ email: editor.email, accessLevel: 'VIEW' })
      .expect(204);
    await owner.delete(`/api/workspaces/${workspaceId}/members/${removed.id}`).expect(204);

    expect(await removedClient.closedWith).toBe(4404);
    expect(await editorClient.closedWith).toBe(4409);

    const reconnected = connect(documentId, { cookies: editor.cookies });
    await reconnected.synced;
    reconnected.doc.getText('body').insert(0, 'after downgrade');
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(await storedText(documentId)).toBe('');
  });

  it('closes a session when its access token expires', async () => {
    const { owner, documentId } = await setup();
    const shortLived = await new JwtService().signAsync(
      { sub: owner.id, iatMs: Date.now() },
      { secret: api.get(ConfigService).get<string>('JWT_ACCESS_SECRET'), expiresIn: 1 },
    );
    const client = connect(documentId, { cookies: `access_token=${shortLived}` });
    await client.synced;

    expect(await client.closedWith).toBe(4401);
  });

  it('serves the health check', async () => {
    await request(collab.getHttpServer()).get('/health').expect(200, { status: 'ok' });
  });
});
