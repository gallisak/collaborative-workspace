import type { Page } from '@playwright/test';
import { connection, createDocument, editor, openEditor, openSession } from './documents';
import { expect, test } from './fixtures';

const REVALIDATION_TIMEOUT = 30_000;

async function publish(page: Page, access: 'Can view' | 'Can edit') {
  await page.getByRole('button', { name: /^Share/ }).click();
  if (access === 'Can edit') {
    await page.getByRole('combobox', { name: 'Access' }).click();
    await page.getByRole('option', { name: 'Can edit' }).click();
  }
  await page.getByRole('button', { name: 'Create link' }).click();
  const url = await page.getByRole('textbox', { name: `${access} link URL` }).inputValue();
  return new URL(url).pathname;
}

test.describe('publishing', () => {
  test('serves a published page from the server and refreshes it after edits', async ({
    browser,
    baseURL,
    request,
  }) => {
    const owner = await openSession(browser, baseURL!, 'Owner Publisher');
    const { url } = await createDocument(owner, baseURL!, 'Release notes');
    const { page } = owner;
    await openEditor(page, url);
    await editor(page).click();
    await page.keyboard.type('Version one ships today');
    await page.waitForTimeout(1500);

    const publicPath = await publish(page, 'Can view');
    expect(publicPath).toMatch(/^\/p\/[\w-]{32}$/);

    const html = await (await request.get(publicPath)).text();
    expect(html).toContain('<title>Release notes · Collab Docs</title>');
    expect(html).toContain('<meta name="description" content="Version one ships today"/>');
    expect(html).toContain('Version one ships today');

    const visitor = await browser.newPage({ baseURL });
    await visitor.goto(publicPath);
    await expect(visitor.getByRole('heading', { level: 1 })).toHaveText('Release notes');
    await expect(visitor.getByText('Version one ships today')).toBeVisible();
    await expect(visitor.getByRole('textbox')).toHaveCount(0);
    await expect(visitor.getByRole('link', { name: 'Edit this page' })).toHaveCount(0);

    await editor(page).press('End');
    await page.keyboard.type(' with comments');
    await expect
      .poll(async () => (await request.get(publicPath)).text(), {
        timeout: REVALIDATION_TIMEOUT,
      })
      .toContain('Version one ships today with comments');
    await visitor.reload();
    await expect(visitor.getByText('Version one ships today with comments')).toBeVisible();

    await page.goto(publicPath.replace('/p/', '/s/'));
    await expect(page).toHaveURL(publicPath);

    await page.goBack();
    await page.getByRole('button', { name: /^Share/ }).click();
    await page.getByRole('button', { name: 'Revoke Can view link' }).click();
    await expect(page.getByText('The page is not published yet.')).toBeVisible();
    await expect
      .poll(async () => (await request.get(publicPath)).text(), {
        timeout: REVALIDATION_TIMEOUT,
      })
      .not.toContain('Version one ships today');
    await visitor.reload();
    await expect(visitor.getByRole('heading', { name: 'Page not found' })).toBeVisible();

    await visitor.close();
    await owner.context.close();
  });

  test('lets signed in people edit through a can-edit link', async ({ browser, baseURL }) => {
    const owner = await openSession(browser, baseURL!, 'Owner Sharer');
    const { url } = await createDocument(owner, baseURL!, 'Open draft');
    await openEditor(owner.page, url);
    const publicPath = await publish(owner.page, 'Can edit');

    const visitor = await browser.newPage({ baseURL });
    await visitor.goto(publicPath);
    await visitor.getByRole('link', { name: 'Edit this page' }).click();
    const sharedPath = publicPath.replace('/p/', '/s/');
    await expect(visitor).toHaveURL(`/login?next=${encodeURIComponent(sharedPath)}`);
    await visitor.close();

    const guest = await openSession(browser, baseURL!, 'Guest Editor');
    await guest.page.goto(sharedPath);
    await expect(guest.page.getByRole('heading', { level: 1 })).toHaveText('Open draft');
    await expect(connection(guest.page)).toHaveText('Saved');
    await editor(guest.page).click();
    await guest.page.keyboard.type('Written by a guest');

    await expect(editor(owner.page)).toContainText('Written by a guest');
    await expect(
      owner.page.locator('.collaboration-carets__label', { hasText: 'Guest Editor' }),
    ).toBeVisible();

    await guest.context.close();
    await owner.context.close();
  });
});
