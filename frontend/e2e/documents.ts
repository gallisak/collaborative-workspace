import { type Browser, type BrowserContext, expect, type Page } from '@playwright/test';
import { newAccount, PASSWORD } from './fixtures';

export interface Session {
  context: BrowserContext;
  page: Page;
  name: string;
  email: string;
}

export async function openSession(browser: Browser, baseURL: string, name: string) {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  const account = newAccount(name);
  const response = await page.request.post('/api/auth/register', {
    data: { ...account, password: PASSWORD },
    headers: { origin: baseURL },
  });
  expect(response.status()).toBe(201);
  return { context, page, ...account } satisfies Session;
}

export async function createDocument(owner: Session, baseURL: string, title: string) {
  const headers = { origin: baseURL };
  const workspace = await owner.page.request.post('/api/workspaces', {
    data: { name: 'Docs team' },
    headers,
  });
  const workspaceId = ((await workspace.json()) as { id: string }).id;
  const document = await owner.page.request.post(`/api/workspaces/${workspaceId}/documents`, {
    data: { title },
    headers,
  });
  const documentId = ((await document.json()) as { id: string }).id;
  return { workspaceId, documentId, url: `/w/${workspaceId}/d/${documentId}` };
}

export async function share(
  owner: Session,
  baseURL: string,
  documentId: string,
  email: string,
  accessLevel: 'VIEW' | 'EDIT',
) {
  const response = await owner.page.request.put(`/api/documents/${documentId}/permissions`, {
    data: { email, accessLevel },
    headers: { origin: baseURL },
  });
  expect(response.status()).toBe(204);
}

export const editor = (page: Page) => page.getByRole('textbox', { name: 'Document content' });

export const connection = (page: Page) =>
  page.getByRole('status').filter({ hasText: /Saved|Connecting|Offline|No access/ });

export async function openEditor(page: Page, url: string) {
  await page.goto(url);
  await expect(connection(page)).toHaveText('Saved');
  await expect(editor(page)).toBeVisible();
}
