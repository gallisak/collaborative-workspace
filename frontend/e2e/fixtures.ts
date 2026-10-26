import { expect, type Page, request, test as base } from '@playwright/test';
import { randomUUID } from 'node:crypto';

export const PASSWORD = 'Password123!';

export interface Account {
  email: string;
  name: string;
}

export const newAccount = (name = 'E2E User'): Account => ({
  email: `ui-${randomUUID()}@e2e.test`,
  name,
});

export async function registerAccount(baseURL: string, account: Account) {
  const api = await request.newContext({ baseURL, extraHTTPHeaders: { origin: baseURL } });
  const response = await api.post('/api/auth/register', {
    data: { ...account, password: PASSWORD },
  });
  expect(response.status(), await response.text()).toBe(201);
  await api.dispose();
}

export async function signIn(page: Page, account: Account) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/workspaces');
}

export async function createWorkspace(page: Page, name: string) {
  await page.goto('/workspaces');
  await page.getByLabel('Workspace name').fill(name);
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await page.waitForURL(/\/w\/[0-9a-f-]{36}$/);
  return new URL(page.url()).pathname.split('/')[2];
}

export const test = base.extend<{ account: Account; signedIn: Account }>({
  account: async ({ baseURL }, provide) => {
    const account = newAccount();
    await registerAccount(baseURL!, account);
    await provide(account);
  },
  signedIn: async ({ page, baseURL }, provide) => {
    const account = newAccount('Owner Person');
    const response = await page.request.post('/api/auth/register', {
      data: { ...account, password: PASSWORD },
      headers: { origin: baseURL! },
    });
    expect(response.status()).toBe(201);
    await provide(account);
  },
});

export const DEMO_VIEWER = { email: 'cara@collab.local', name: 'Cara Viewer' };

export { expect };
