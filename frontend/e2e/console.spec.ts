import { expect, newAccount, PASSWORD, test } from './fixtures';

test('pages load without console errors', async ({ page, baseURL }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text().split('\n')[0]);
    }
  });
  page.on('pageerror', (error) => errors.push(error.message));
  const headers = { origin: baseURL! };
  const account = newAccount('Console Check');
  await page.request.post('/api/auth/register', {
    data: { ...account, password: PASSWORD },
    headers,
  });
  const workspace = (await (
    await page.request.post('/api/workspaces', { data: { name: 'Console' }, headers })
  ).json()) as { id: string };
  const document = (await (
    await page.request.post(`/api/workspaces/${workspace.id}/documents`, {
      data: { title: 'Console' },
      headers,
    })
  ).json()) as { id: string };

  for (const path of [
    '/workspaces',
    `/w/${workspace.id}`,
    `/w/${workspace.id}/settings`,
    `/w/${workspace.id}/d/${document.id}`,
  ]) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
  }

  expect(errors).toEqual([]);
});
