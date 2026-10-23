import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import type { MailMessage } from '../src/infra/mail/mail.service.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { setupApp } from '../src/setup-app.js';

export const PASSWORD = 'Password123!';
export const WEB_ORIGIN = 'http://localhost:3000';
export const E2E_EMAIL_DOMAIN = '@e2e.test';

export interface TestAppOptions {
  overrides?: { token: unknown; value: unknown }[];
}

export async function createTestApp({ overrides = [] }: TestAppOptions = {}) {
  let builder = Test.createTestingModule({ imports: [AppModule] });
  for (const { token, value } of overrides) {
    builder = builder.overrideProvider(token).useValue(value);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication({ bufferLogs: true });
  setupApp(app);
  await app.init();
  return { app, prisma: app.get(PrismaService) };
}

export const uniqueEmail = (prefix = 'user') => `${prefix}-${randomUUID()}${E2E_EMAIL_DOMAIN}`;

export const cookieValue = (setCookies: string[], name: string) =>
  setCookies.find((cookie) => cookie.startsWith(`${name}=`))?.split(';')[0];

export const sessionCookies = (setCookies: string[]) =>
  ['access_token', 'refresh_token']
    .map((name) => cookieValue(setCookies, name))
    .filter((pair): pair is string => pair !== undefined)
    .join('; ');

export async function registerUser(app: INestApplication, email = uniqueEmail()) {
  const res = await request(app.getHttpServer())
    .post('/api/auth/register')
    .set('Origin', WEB_ORIGIN)
    .send({ email, password: PASSWORD, name: 'E2E User' })
    .expect(201);
  const setCookies = res.get('Set-Cookie') ?? [];
  return { email, user: res.body.user as { id: string }, setCookies };
}

export class CapturingMail {
  readonly sent: MailMessage[] = [];

  send(message: MailMessage) {
    this.sent.push(message);
  }

  tokenFor(email: string): string {
    const message = this.sent.findLast((m) => m.to === email);
    if (!message) {
      throw new Error(`No mail sent to ${email}`);
    }
    return new URL(message.link).searchParams.get('token')!;
  }
}

export async function signUp(app: INestApplication, email = uniqueEmail()) {
  const { user, setCookies } = await registerUser(app, email);
  const cookies = sessionCookies(setCookies);
  return {
    id: user.id,
    email,
    cookies,
    get: (path: string) => request(app.getHttpServer()).get(path).set('Cookie', cookies),
    post: (path: string) =>
      request(app.getHttpServer()).post(path).set('Origin', WEB_ORIGIN).set('Cookie', cookies),
    put: (path: string) =>
      request(app.getHttpServer()).put(path).set('Origin', WEB_ORIGIN).set('Cookie', cookies),
    patch: (path: string) =>
      request(app.getHttpServer()).patch(path).set('Origin', WEB_ORIGIN).set('Cookie', cookies),
    delete: (path: string) =>
      request(app.getHttpServer()).delete(path).set('Origin', WEB_ORIGIN).set('Cookie', cookies),
  };
}

export type TestUser = Awaited<ReturnType<typeof signUp>>;

export async function cleanupE2eData(prisma: PrismaService) {
  const e2eUsers = { email: { endsWith: E2E_EMAIL_DOMAIN } };
  await prisma.workspace.deleteMany({ where: { members: { some: { user: e2eUsers } } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: E2E_EMAIL_DOMAIN } } });
}
