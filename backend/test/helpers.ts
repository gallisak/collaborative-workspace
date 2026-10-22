import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { setupApp } from '../src/setup-app.js';

export const PASSWORD = 'Password123!';
export const WEB_ORIGIN = 'http://localhost:3000';
export const E2E_EMAIL_DOMAIN = '@e2e.test';

export async function createTestApp() {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
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

export async function cleanupE2eData(prisma: PrismaService) {
  await prisma.user.deleteMany({ where: { email: { endsWith: E2E_EMAIL_DOMAIN } } });
}
