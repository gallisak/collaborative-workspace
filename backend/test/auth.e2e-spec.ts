import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import {
  cleanupE2eData,
  cookieValue,
  createTestApp,
  PASSWORD,
  registerUser,
  sessionCookies,
  uniqueEmail,
  WEB_ORIGIN,
} from './helpers.js';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());
  const post = (path: string) => http().post(path).set('Origin', WEB_ORIGIN);
  const refresh = (cookies: string) => post('/api/auth/refresh').set('Cookie', cookies);
  const me = (cookies: string) => http().get('/api/auth/me').set('Cookie', cookies);

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await cleanupE2eData(prisma);
    await app.close();
  });

  describe('register', () => {
    it('creates a user and sets httpOnly session cookies without exposing tokens', async () => {
      const { email, setCookies } = await registerUser(app);
      const res = await me(sessionCookies(setCookies)).expect(200);

      expect(res.body).toEqual({ id: expect.any(String), email, name: 'E2E User' });
      for (const name of ['access_token', 'refresh_token']) {
        const cookie = setCookies.find((c) => c.startsWith(`${name}=`));
        expect(cookie).toMatch(/HttpOnly/);
        expect(cookie).toMatch(/SameSite=Lax/);
        expect(cookie).toMatch(/Path=\//);
      }
    });

    it('does not return tokens in the body', async () => {
      const res = await post('/api/auth/register')
        .send({ email: uniqueEmail(), password: PASSWORD, name: 'Body' })
        .expect(201);

      expect(Object.keys(res.body)).toEqual(['user']);
    });

    it('normalizes the email', async () => {
      const email = uniqueEmail();
      await post('/api/auth/register')
        .send({ email: `  ${email.toUpperCase()} `, password: PASSWORD, name: 'Upper' })
        .expect(201)
        .expect(({ body }) => expect(body.user.email).toBe(email));
    });

    it('rejects a duplicate email regardless of case', async () => {
      const { email } = await registerUser(app);

      await post('/api/auth/register')
        .send({ email: email.toUpperCase(), password: PASSWORD, name: 'Again' })
        .expect(409);
    });

    it('rejects unknown fields', async () => {
      const res = await post('/api/auth/register')
        .send({ email: uniqueEmail(), password: PASSWORD, name: 'Extra', admin: true })
        .expect(400);

      expect(res.body.message).toContain('property admin should not exist');
    });

    it('validates the payload', async () => {
      const res = await post('/api/auth/register')
        .send({ email: 'not-an-email', password: 'short', name: '   ' })
        .expect(400);

      expect(res.body.message).toEqual(
        expect.arrayContaining([
          'email must be an email',
          'password must be longer than or equal to 8 characters',
          'name must be longer than or equal to 1 characters',
        ]),
      );
    });
  });

  describe('login and me', () => {
    it('logs in with the access cookie or a bearer token', async () => {
      const { email } = await registerUser(app);
      const res = await post('/api/auth/login').send({ email, password: PASSWORD }).expect(200);
      const setCookies = res.get('Set-Cookie') ?? [];
      const accessToken = cookieValue(setCookies, 'access_token')!.split('=')[1];

      await me(sessionCookies(setCookies)).expect(200);
      await http()
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect(({ body }) => expect(body).not.toHaveProperty('passwordHash'));
    });

    it('returns the same error for a wrong password and an unknown email', async () => {
      const { email } = await registerUser(app);

      const wrongPassword = await post('/api/auth/login')
        .send({ email, password: 'WrongPassword1' })
        .expect(401);
      const unknownEmail = await post('/api/auth/login')
        .send({ email: uniqueEmail(), password: PASSWORD })
        .expect(401);

      expect(wrongPassword.body.message).toBe(unknownEmail.body.message);
    });

    it('rejects a forged access token', async () => {
      await me('access_token=forged.token.value').expect(401);
    });

    it('rate limits login attempts per email', async () => {
      const { email } = await registerUser(app);
      const attempt = () => post('/api/auth/login').send({ email, password: 'WrongPassword1' });

      for (let i = 0; i < 5; i++) {
        await attempt().expect(401);
      }
      await attempt().expect(429);
      await post('/api/auth/login').send({ email, password: PASSWORD }).expect(429);
    });

    it('keeps the per email limit when attempts come from different addresses', async () => {
      const { email } = await registerUser(app);
      const attempt = (i: number) =>
        post('/api/auth/login')
          .set('X-Forwarded-For', `203.0.113.${i}`)
          .send({ email, password: 'WrongPassword1' });

      for (let i = 0; i < 5; i++) {
        await attempt(i).expect(401);
      }
      await attempt(99).expect(429);
    });
  });

  describe('refresh token rotation', () => {
    it('rotates both cookies', async () => {
      const { setCookies } = await registerUser(app);

      const res = await refresh(sessionCookies(setCookies)).expect(200);
      const rotated = res.get('Set-Cookie') ?? [];

      expect(cookieValue(rotated, 'refresh_token')).not.toBe(
        cookieValue(setCookies, 'refresh_token'),
      );
      await me(sessionCookies(rotated)).expect(200);
    });

    it('ignores a refresh token sent in the body', async () => {
      const { setCookies } = await registerUser(app);
      const token = cookieValue(setCookies, 'refresh_token')!.split('=')[1];

      await post('/api/auth/refresh').send({ refreshToken: token }).expect(401);
    });

    it('gives concurrent refreshes from two tabs their own tokens', async () => {
      const { setCookies } = await registerUser(app);
      const cookies = sessionCookies(setCookies);

      const results = await Promise.all([refresh(cookies), refresh(cookies)]);

      expect(results.map((r) => r.status)).toEqual([200, 200]);
      for (const result of results) {
        await refresh(sessionCookies(result.get('Set-Cookie') ?? [])).expect(200);
      }
    });

    it('treats a quick reuse from another device as theft', async () => {
      const { setCookies } = await registerUser(app);
      const stolen = sessionCookies(setCookies);
      const rotated = await refresh(stolen).set('User-Agent', 'Owner browser').expect(200);
      const owner = sessionCookies(rotated.get('Set-Cookie') ?? []);

      await refresh(stolen).set('User-Agent', 'Attacker tool').expect(401);

      await refresh(owner).set('User-Agent', 'Owner browser').expect(401);
      await me(owner).expect(401);
    });

    it('treats a late reuse as theft and revokes the session and access tokens', async () => {
      const { user, setCookies } = await registerUser(app);
      const first = sessionCookies(setCookies);
      const rotated = await refresh(first).expect(200);
      const second = sessionCookies(rotated.get('Set-Cookie') ?? []);

      await prisma.refreshToken.updateMany({
        where: { userId: user.id, rotatedAt: { not: null } },
        data: { rotatedAt: new Date(Date.now() - 60_000) },
      });

      await refresh(first).expect(401);
      await refresh(second).expect(401);
      await me(second).expect(401);
    });

    it('clears the cookies when refresh fails', async () => {
      const res = await refresh('refresh_token=unknown').expect(401);

      expect(res.get('Set-Cookie')?.join(';')).toMatch(/refresh_token=;.*Expires=Thu, 01 Jan 1970/);
    });
  });

  describe('logout', () => {
    it('revokes the refresh token and clears both cookies', async () => {
      const { setCookies } = await registerUser(app);
      const cookies = sessionCookies(setCookies);

      const res = await post('/api/auth/logout').set('Cookie', cookies).expect(204);
      const cleared = res.get('Set-Cookie') ?? [];

      for (const name of ['access_token', 'refresh_token']) {
        expect(cleared.find((c) => c.startsWith(`${name}=`))).toMatch(/Expires=Thu, 01 Jan 1970/);
      }
      await refresh(cookies).expect(401);
    });
  });

  describe('cross-site request protection', () => {
    it('rejects a cookie-authenticated mutation from a foreign origin', async () => {
      const { setCookies } = await registerUser(app);

      await http()
        .post('/api/auth/logout')
        .set('Origin', 'https://evil.example')
        .set('Cookie', sessionCookies(setCookies))
        .expect(403);
    });

    it('rejects a cookie-authenticated mutation without an origin', async () => {
      const { setCookies } = await registerUser(app);

      await http().post('/api/auth/refresh').set('Cookie', sessionCookies(setCookies)).expect(403);
    });

    it('allows reads from any origin', async () => {
      const { setCookies } = await registerUser(app);

      await me(sessionCookies(setCookies)).set('Origin', 'https://evil.example').expect(200);
    });
  });
});
