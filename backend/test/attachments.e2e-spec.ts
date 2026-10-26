import { CreateBucketCommand, HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import type { INestApplication } from '@nestjs/common';
import type { Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { MailService } from '../src/infra/mail/mail.service.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { AttachmentJob } from '../src/infra/queue/attachment-jobs.js';
import { StorageService } from '../src/infra/storage/storage.service.js';
import { UploadCleanupProcessor } from '../src/modules/attachments/upload-cleanup.processor.js';
import {
  CapturingMail,
  cleanupE2eData,
  createTestApp,
  signUp,
  startWorker,
  type TestUser,
} from './helpers.js';

interface Created {
  attachment: { id: string; url: string; status: string };
  upload: { url: string; fields: Record<string, string> };
}

const MB = 1024 * 1024;
const png = (size: number) => new Uint8Array(new ArrayBuffer(size)).fill(7);

async function ensureBucket(config: ConfigService) {
  const s3 = new S3Client({
    endpoint: config.getOrThrow<string>('S3_ENDPOINT'),
    region: config.getOrThrow<string>('S3_REGION'),
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.getOrThrow<string>('S3_ACCESS_KEY'),
      secretAccessKey: config.getOrThrow<string>('S3_SECRET_KEY'),
    },
  });
  const Bucket = config.getOrThrow<string>('S3_BUCKET');
  await s3
    .send(new HeadBucketCommand({ Bucket }))
    .catch(() => s3.send(new CreateBucketCommand({ Bucket })));
  s3.destroy();
}

describe('Attachments (e2e)', () => {
  let app: INestApplication;
  let worker: INestApplication;
  let prisma: PrismaService;
  const mail = new CapturingMail();

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp({ overrides: [{ token: MailService, value: mail }] }));
    worker = await startWorker();
    await ensureBucket(app.get(ConfigService));
  });

  afterAll(async () => {
    await worker.close();
    await cleanupE2eData(prisma);
    await app.close();
  });

  const setup = async () => {
    const owner = await signUp(app);
    const workspace = await owner.post('/api/workspaces').send({ name: 'E2E files' }).expect(201);
    const workspaceId = workspace.body.id as string;
    const doc = await owner
      .post(`/api/workspaces/${workspaceId}/documents`)
      .send({ title: 'With images' })
      .expect(201);
    return { owner, workspaceId, documentId: doc.body.id as string };
  };

  const requestUpload = (user: TestUser, documentId: string, sizeBytes: number, extra = {}) =>
    user
      .post(`/api/documents/${documentId}/attachments`)
      .send({ fileName: 'chart.png', contentType: 'image/png', sizeBytes, ...extra });

  const uploadTo = async (
    { upload }: Created,
    bytes: Uint8Array<ArrayBuffer>,
    overrides: Record<string, string> = {},
  ) => {
    const form = new FormData();
    for (const [key, value] of Object.entries({ ...upload.fields, ...overrides })) {
      form.append(key, value);
    }
    form.append('file', new Blob([bytes]));
    return fetch(upload.url, { method: 'POST', body: form });
  };

  const uploadImage = async (owner: TestUser, documentId: string, size = 2048) => {
    const created = (await requestUpload(owner, documentId, size).expect(201)).body as Created;
    expect((await uploadTo(created, png(size))).ok).toBe(true);
    await owner.post(`/api/attachments/${created.attachment.id}/complete`).expect(200);
    return created.attachment;
  };

  const fillStorage = (workspaceId: string, documentId: string, sizeBytes: number) =>
    prisma.attachment.create({
      data: {
        workspaceId,
        documentId,
        objectKey: `e2e/${crypto.randomUUID()}`,
        fileName: 'big.png',
        contentType: 'image/png',
        sizeBytes: BigInt(sizeBytes),
        status: 'UPLOADED',
      },
    });

  it('uploads an image straight to storage and serves it through a presigned redirect', async () => {
    const { owner, workspaceId, documentId } = await setup();
    const created = (await requestUpload(owner, documentId, 2048).expect(201)).body as Created;
    expect(created.attachment.status).toBe('PENDING');
    expect(created.attachment.url).toBe(`/api/attachments/${created.attachment.id}/content`);

    await owner.post(`/api/attachments/${created.attachment.id}/complete`).expect(400);
    expect((await uploadTo(created, png(2048))).ok).toBe(true);
    const completed = await owner
      .post(`/api/attachments/${created.attachment.id}/complete`)
      .expect(200);
    expect(completed.body).toMatchObject({ status: 'UPLOADED', sizeBytes: 2048 });

    const res = await owner.get(created.attachment.url).expect(302);
    const file = await fetch(res.headers.location);
    expect(file.headers.get('content-type')).toBe('image/png');
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(png(2048));

    const billing = await owner.get(`/api/workspaces/${workspaceId}/billing`).expect(200);
    expect(billing.body.usage.storageBytes).toBe(2048);
  });

  it('lets storage enforce the declared size and type', async () => {
    const { owner, documentId } = await setup();
    const created = (await requestUpload(owner, documentId, 1000).expect(201)).body as Created;

    expect((await uploadTo(created, png(5000))).ok).toBe(false);
    expect((await uploadTo(created, png(1000), { 'Content-Type': 'text/html' })).ok).toBe(false);
    await owner.post(`/api/attachments/${created.attachment.id}/complete`).expect(400);
  });

  it('accepts only images up to the size limit', async () => {
    const { owner, documentId } = await setup();

    await requestUpload(owner, documentId, 1024, { contentType: 'image/svg+xml' }).expect(400);
    await requestUpload(owner, documentId, 1024, { contentType: 'text/html' }).expect(400);
    const tooLarge = await requestUpload(owner, documentId, 2 * MB).expect(413);
    expect(tooLarge.body.message).toBe('Images can be up to 1 MB');
  });

  it('stops at the storage limit of the plan, counting uploads in progress', async () => {
    const { owner, workspaceId, documentId } = await setup();
    await fillStorage(workspaceId, documentId, 100 * MB - 3000);

    const results = await Promise.all([
      requestUpload(owner, documentId, 2000),
      requestUpload(owner, documentId, 2000),
    ]);

    expect(results.map((res) => res.status).sort()).toEqual([201, 402]);
    const blocked = results.find((res) => res.status === 402)!;
    expect(blocked.body.message).toBe(
      'The Free plan allows up to 100 MB of storage. Upgrade the plan to add more.',
    );
  });

  it('frees storage when an attachment is deleted', async () => {
    const { owner, workspaceId, documentId } = await setup();
    const attachment = await uploadImage(owner, documentId);

    await owner.delete(`/api/attachments/${attachment.id}`).expect(204);

    await owner.get(attachment.url).expect(404);
    const billing = await owner.get(`/api/workspaces/${workspaceId}/billing`).expect(200);
    expect(billing.body.usage.storageBytes).toBe(0);
  });

  it('serves images only to readers of the document or visitors of a published page', async () => {
    const { owner, workspaceId, documentId } = await setup();
    const viewer = await signUp(app);
    const stranger = await signUp(app);
    await owner
      .post(`/api/workspaces/${workspaceId}/invitations`)
      .send({ email: viewer.email, role: 'VIEWER' })
      .expect(201);
    await viewer
      .post('/api/invitations/accept')
      .send({ token: mail.tokenFor(viewer.email) })
      .expect(200);
    const attachment = await uploadImage(owner, documentId);

    await viewer.get(attachment.url).expect(302);
    await requestUpload(viewer, documentId, 1024).expect(403);
    await viewer.delete(`/api/attachments/${attachment.id}`).expect(403);
    await stranger.get(attachment.url).expect(404);
    await request(app.getHttpServer()).get(attachment.url).expect(404);

    await owner
      .post(`/api/documents/${documentId}/share-links`)
      .send({ accessLevel: 'VIEW' })
      .expect(201);
    await request(app.getHttpServer()).get(attachment.url).expect(302);
    await stranger.get(attachment.url).expect(302);
  });

  it('removes uploads that were never completed', async () => {
    const { owner, documentId } = await setup();
    const created = (await requestUpload(owner, documentId, 1024).expect(201)).body as Created;
    await uploadTo(created, png(1024));
    await prisma.attachment.update({
      where: { id: created.attachment.id },
      data: { createdAt: new Date(Date.now() - 60 * 60_000) },
    });

    await owner.post(`/api/attachments/${created.attachment.id}/complete`).expect(400);
    await worker.get(UploadCleanupProcessor).process({ name: AttachmentJob.CleanupUploads } as Job);

    expect(await prisma.attachment.count({ where: { id: created.attachment.id } })).toBe(0);
  });

  it('removes the files of a deleted workspace from storage', async () => {
    const { owner, workspaceId, documentId } = await setup();
    const created = (await requestUpload(owner, documentId, 1024).expect(201)).body as Created;
    await uploadTo(created, png(1024));
    await owner.post(`/api/attachments/${created.attachment.id}/complete`).expect(200);
    const { objectKey } = await prisma.attachment.findUniqueOrThrow({
      where: { id: created.attachment.id },
    });
    const storage = worker.get(StorageService);
    expect(await storage.head(objectKey)).not.toBeNull();

    await owner.delete(`/api/workspaces/${workspaceId}`).expect(204);
    await worker
      .get(UploadCleanupProcessor)
      .process({ name: AttachmentJob.PurgeWorkspace, data: { workspaceId } } as Job);

    expect(await storage.head(objectKey)).toBeNull();
  });
});
