import type { INestApplication } from '@nestjs/common';
import type { Job } from 'bullmq';
import { MailService } from '../src/infra/mail/mail.service.js';
import { NotificationJob, type NotifyMentionsJob } from '../src/infra/queue/notification-jobs.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { MentionsProcessor } from '../src/modules/notifications/mentions.processor.js';
import { eventually } from './collab-harness.js';
import {
  CapturingMail,
  cleanupE2eData,
  createTestApp,
  signUp,
  startWorker,
  type TestUser,
} from './helpers.js';

interface Notification {
  id: string;
  type: string;
  actor: { id: string } | null;
  document: { id: string; title: string } | null;
  comment: { id: string; threadId: string; excerpt: string } | null;
  readAt: string | null;
}

describe('Comments and notifications (e2e)', () => {
  let app: INestApplication;
  let worker: INestApplication;
  let prisma: PrismaService;
  const mail = new CapturingMail();

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp({ overrides: [{ token: MailService, value: mail }] }));
    worker = await startWorker();
  });

  afterAll(async () => {
    await worker.close();
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
    const workspace = await owner
      .post('/api/workspaces')
      .send({ name: 'E2E comments' })
      .expect(201);
    const workspaceId = workspace.body.id as string;
    const doc = await owner
      .post(`/api/workspaces/${workspaceId}/documents`)
      .send({ title: 'Spec' })
      .expect(201);
    const editor = await join(owner, workspaceId, 'EDITOR');
    const viewer = await join(owner, workspaceId, 'VIEWER');
    return { owner, editor, viewer, workspaceId, documentId: doc.body.id as string };
  };

  const notificationsOf = async (user: TestUser) =>
    (await user.get('/api/notifications').expect(200)).body as Notification[];

  const unread = async (user: TestUser) =>
    (await user.get('/api/notifications/unread-count').expect(200)).body.count as number;

  it('comments on a block and notifies mentioned users through the queue', async () => {
    const { editor, viewer, documentId } = await setup();

    const res = await editor
      .post(`/api/documents/${documentId}/threads`)
      .send({
        blockId: 'block-1',
        body: '@viewer please review, cc @me',
        mentionedUserIds: [viewer.id, editor.id, viewer.id],
      })
      .expect(201);
    expect(res.body).toMatchObject({
      blockId: 'block-1',
      resolvedAt: null,
      comments: [{ body: '@viewer please review, cc @me', author: { id: editor.id } }],
    });
    expect(res.body.comments[0].mentions).toHaveLength(2);

    await eventually(async () => (await unread(viewer)) === 1);
    const [notification] = await notificationsOf(viewer);
    expect(notification).toMatchObject({
      type: 'MENTION',
      actor: { id: editor.id },
      document: { id: documentId, title: 'Spec' },
      comment: { threadId: res.body.id, excerpt: '@viewer please review, cc @me' },
      readAt: null,
    });
    expect(await notificationsOf(editor)).toEqual([]);

    await viewer.post(`/api/notifications/${notification.id}/read`).expect(204);
    await viewer.post(`/api/notifications/${notification.id}/read`).expect(204);
    expect(await unread(viewer)).toBe(0);
    await editor.post(`/api/notifications/${notification.id}/read`).expect(404);
  });

  it('creates a notification once even when the job is delivered again', async () => {
    const { editor, viewer, documentId } = await setup();
    const res = await editor
      .post(`/api/documents/${documentId}/threads`)
      .send({ blockId: 'b', body: 'hi', mentionedUserIds: [viewer.id] })
      .expect(201);
    const commentId = res.body.comments[0].id as string;
    await eventually(async () => (await unread(viewer)) === 1);

    const processor = worker.get(MentionsProcessor);
    const job = {
      name: NotificationJob.NotifyMentions,
      data: { commentId },
    } as Job<NotifyMentionsJob>;
    await processor.process(job);
    await processor.process(job);

    expect(await prisma.notification.count({ where: { commentId } })).toBe(1);
  });

  it('delivers mentions whose job was lost through the reconciliation', async () => {
    const { editor, viewer, documentId } = await setup();
    const res = await editor
      .post(`/api/documents/${documentId}/threads`)
      .send({ blockId: 'b', body: 'lost', mentionedUserIds: [viewer.id] })
      .expect(201);
    const commentId = res.body.comments[0].id as string;
    await eventually(async () => (await unread(viewer)) === 1);
    await prisma.notification.deleteMany({ where: { commentId } });
    await prisma.commentMention.updateMany({ where: { commentId }, data: { notifiedAt: null } });
    await prisma.comment.update({
      where: { id: commentId },
      data: { createdAt: new Date(Date.now() - 5 * 60_000) },
    });

    await worker.get(MentionsProcessor).process({ name: NotificationJob.ReconcileMentions } as Job);

    await eventually(async () => (await prisma.notification.count({ where: { commentId } })) === 1);
  });

  it('lets viewers read threads but not comment, and hides threads from strangers', async () => {
    const { editor, viewer, documentId } = await setup();
    const stranger = await signUp(app);
    const thread = await editor
      .post(`/api/documents/${documentId}/threads`)
      .send({ blockId: 'b', body: 'first' })
      .expect(201);

    const list = await viewer.get(`/api/documents/${documentId}/threads`).expect(200);
    expect(list.body).toHaveLength(1);
    await viewer
      .post(`/api/documents/${documentId}/threads`)
      .send({ blockId: 'b', body: 'no' })
      .expect(403);
    await viewer.post(`/api/threads/${thread.body.id}/comments`).send({ body: 'no' }).expect(403);
    await viewer.patch(`/api/threads/${thread.body.id}`).send({ resolved: true }).expect(403);

    await stranger.get(`/api/documents/${documentId}/threads`).expect(404);
    await stranger.post(`/api/threads/${thread.body.id}/comments`).send({ body: 'x' }).expect(404);
    await stranger.delete(`/api/comments/${thread.body.comments[0].id}`).expect(404);
  });

  it('rejects mentions of users without access to the document', async () => {
    const { editor, documentId } = await setup();
    const outsider = await signUp(app);

    await editor
      .post(`/api/documents/${documentId}/threads`)
      .send({ blockId: 'b', body: 'hey', mentionedUserIds: [outsider.id] })
      .expect(400);

    expect(await prisma.commentThread.count({ where: { documentId } })).toBe(0);
  });

  it('replies, resolves and reopens a thread', async () => {
    const { owner, editor, documentId } = await setup();
    const thread = await editor
      .post(`/api/documents/${documentId}/threads`)
      .send({ blockId: 'b', body: 'question' })
      .expect(201);

    await owner
      .post(`/api/threads/${thread.body.id}/comments`)
      .send({ body: 'answer' })
      .expect(201);
    const resolved = await owner
      .patch(`/api/threads/${thread.body.id}`)
      .send({ resolved: true })
      .expect(200);
    expect(resolved.body.resolvedBy.id).toBe(owner.id);
    expect(resolved.body.comments.map((c: { body: string }) => c.body)).toEqual([
      'question',
      'answer',
    ]);

    const reopened = await editor
      .patch(`/api/threads/${thread.body.id}`)
      .send({ resolved: false })
      .expect(200);
    expect(reopened.body).toMatchObject({ resolvedAt: null, resolvedBy: null });
  });

  it('lets only the author or a manager delete a comment', async () => {
    const { owner, editor, documentId } = await setup();
    const thread = await editor
      .post(`/api/documents/${documentId}/threads`)
      .send({ blockId: 'b', body: 'by editor' })
      .expect(201);
    const reply = await owner
      .post(`/api/threads/${thread.body.id}/comments`)
      .send({ body: 'by owner' })
      .expect(201);

    await editor.delete(`/api/comments/${reply.body.id}`).expect(403);
    await owner.delete(`/api/comments/${thread.body.comments[0].id}`).expect(204);
    await owner.delete(`/api/comments/${reply.body.id}`).expect(204);

    const list = await editor.get(`/api/documents/${documentId}/threads`).expect(200);
    expect(list.body).toEqual([]);
    await editor.post(`/api/threads/${thread.body.id}/comments`).send({ body: 'x' }).expect(404);
  });

  it('hides notifications of deleted documents', async () => {
    const { owner, editor, viewer, documentId } = await setup();
    await editor
      .post(`/api/documents/${documentId}/threads`)
      .send({ blockId: 'b', body: 'look', mentionedUserIds: [viewer.id] })
      .expect(201);
    await eventually(async () => (await unread(viewer)) === 1);

    await owner.delete(`/api/documents/${documentId}`).expect(204);

    expect(await notificationsOf(viewer)).toEqual([]);
    expect(await unread(viewer)).toBe(0);
  });
});
