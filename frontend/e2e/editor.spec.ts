import {
  connection as status,
  createDocument,
  documentText,
  editor,
  openEditor,
  openSession,
  share,
} from './documents';
import { expect, test } from './fixtures';

test.describe('document editor', () => {
  test('writes every block type and keeps the content after a reload', async ({
    browser,
    baseURL,
  }) => {
    const owner = await openSession(browser, baseURL!, 'Owner Writer');
    const { url } = await createDocument(owner, baseURL!, 'Spec');
    const { page } = owner;
    await openEditor(page, url);
    const toolbar = page.getByRole('toolbar', { name: 'Formatting' });

    await editor(page).click();
    await page.keyboard.type('Launch plan');
    await toolbar.getByRole('combobox', { name: 'Block type' }).click();
    await page.getByRole('option', { name: 'Heading 1' }).click();
    await editor(page).press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Ship the ');
    await toolbar.getByRole('button', { name: 'Bold' }).click();
    await page.keyboard.type('editor');
    await toolbar.getByRole('button', { name: 'Bold' }).click();
    await page.keyboard.press('Enter');
    await toolbar.getByRole('button', { name: 'Bulleted list' }).click();
    await page.keyboard.type('First point');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await toolbar.getByRole('button', { name: 'Checklist' }).click();
    await page.keyboard.type('Write tests');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await toolbar.getByRole('button', { name: 'Code block' }).click();
    await page.keyboard.type('npm run build');

    await page.waitForTimeout(1500);
    await page.reload();
    await expect(status(page)).toHaveText('Saved');

    const content = editor(page);
    await expect(content.locator('h1')).toHaveText('Launch plan');
    await expect(content.locator('p strong')).toHaveText('editor');
    await expect(content.locator('ul:not([data-type]) li')).toHaveText('First point');
    await expect(content.locator('ul[data-type="taskList"] li > div')).toHaveText('Write tests');
    await expect(content.locator('pre code')).toHaveText('npm run build');
    await owner.context.close();
  });

  test('lets two people edit at the same time and shows who is there', async ({
    browser,
    baseURL,
  }) => {
    const owner = await openSession(browser, baseURL!, 'Ann Owner');
    const guest = await openSession(browser, baseURL!, 'Bob Guest');
    const { url, documentId } = await createDocument(owner, baseURL!, 'Shared notes');
    await share(owner, baseURL!, documentId, guest.email, 'EDIT');
    await openEditor(owner.page, url);
    await openEditor(guest.page, url);

    await editor(owner.page).click();
    await owner.page.keyboard.type('Hello from Ann. ');
    await editor(guest.page).click();
    await guest.page.keyboard.press('ControlOrMeta+End');
    await guest.page.keyboard.type('Hi from Bob.');

    for (const { page } of [owner, guest]) {
      await expect.poll(() => documentText(page)).toContain('Hello from Ann.');
      await expect.poll(() => documentText(page)).toContain('Hi from Bob.');
    }
    await expect(owner.page.getByRole('list', { name: 'People editing now' })).toContainText(
      'Bob Guest',
    );
    await expect(guest.page.getByRole('list', { name: 'People editing now' })).toContainText(
      'Ann Owner',
    );
    await expect(owner.page.locator('.collaboration-carets__label')).toHaveText('Bob Guest');
    await owner.context.close();
    await guest.context.close();
  });

  test('keeps a viewer read only while they follow edits live', async ({ browser, baseURL }) => {
    const owner = await openSession(browser, baseURL!, 'Ann Owner');
    const viewer = await openSession(browser, baseURL!, 'Cara Viewer');
    const { url, documentId } = await createDocument(owner, baseURL!, 'Read only');
    await share(owner, baseURL!, documentId, viewer.email, 'VIEW');
    await openEditor(owner.page, url);
    await openEditor(viewer.page, url, { writable: false });

    await expect(editor(viewer.page)).toHaveAttribute('contenteditable', 'false');
    await expect(viewer.page.getByRole('toolbar', { name: 'Formatting' })).toHaveCount(0);
    await expect(viewer.page.getByRole('textbox', { name: 'Page title' })).toHaveCount(0);

    await editor(owner.page).click();
    await owner.page.keyboard.type('Visible to the viewer');
    await expect.poll(() => documentText(viewer.page)).toContain('Visible to the viewer');

    await editor(viewer.page).click();
    await viewer.page.keyboard.type('should not appear');
    await owner.page.waitForTimeout(500);
    await expect(editor(owner.page)).not.toContainText('should not appear');
    await owner.context.close();
    await viewer.context.close();
  });

  test('works offline and syncs the changes after reconnecting', async ({ browser, baseURL }) => {
    const owner = await openSession(browser, baseURL!, 'Ann Owner');
    const guest = await openSession(browser, baseURL!, 'Bob Guest');
    const { url, documentId } = await createDocument(owner, baseURL!, 'Offline');
    await share(owner, baseURL!, documentId, guest.email, 'EDIT');
    await openEditor(owner.page, url);
    await openEditor(guest.page, url);

    await owner.context.setOffline(true);
    await expect(status(owner.page)).toContainText('Offline');
    await editor(owner.page).click();
    await owner.page.keyboard.type('Written while offline');
    await expect(editor(guest.page)).not.toContainText('Written while offline');

    await owner.context.setOffline(false);
    await expect(status(owner.page)).toHaveText('Saved', { timeout: 15_000 });
    await expect.poll(() => documentText(guest.page)).toContain('Written while offline');
    await owner.context.close();
    await guest.context.close();
  });

  test('closes the editor when access is revoked', async ({ browser, baseURL }) => {
    const owner = await openSession(browser, baseURL!, 'Ann Owner');
    const guest = await openSession(browser, baseURL!, 'Bob Guest');
    const { url, documentId } = await createDocument(owner, baseURL!, 'Private');
    await share(owner, baseURL!, documentId, guest.email, 'EDIT');
    const guestId = (
      (await (await guest.page.request.get('/api/auth/me')).json()) as { id: string }
    ).id;
    await openEditor(guest.page, url);

    const revoke = await owner.page.request.delete(
      `/api/documents/${documentId}/permissions/${guestId}`,
      {
        headers: { origin: baseURL! },
      },
    );
    expect(revoke.status()).toBe(204);

    await expect(guest.page.getByText('This page is no longer available')).toBeVisible();
    await expect(editor(guest.page)).toHaveAttribute('contenteditable', 'false');
    await owner.context.close();
    await guest.context.close();
  });

  test('renames the page from its title and updates the tree', async ({ browser, baseURL }) => {
    const owner = await openSession(browser, baseURL!, 'Ann Owner');
    const { url } = await createDocument(owner, baseURL!, 'Draft');
    const { page } = owner;
    await openEditor(page, url);

    const title = page.getByRole('main').getByRole('textbox', { name: 'Page title' });
    await title.fill('Release notes');
    await title.press('Enter');

    await expect(page.getByRole('tree', { name: 'Pages' }).getByRole('link')).toHaveText(
      'Release notes',
    );
    await page.reload();
    await expect(title).toHaveValue('Release notes');
    await owner.context.close();
  });

  test('accepts only web and email links', async ({ browser, baseURL }) => {
    const owner = await openSession(browser, baseURL!, 'Ann Owner');
    const { url } = await createDocument(owner, baseURL!, 'Links');
    const { page } = owner;
    await openEditor(page, url);
    await editor(page).click();
    await page.keyboard.type('docs');
    await page.keyboard.press('Shift+Home');

    await page.getByRole('button', { name: 'Link', exact: true }).click();
    await page.getByRole('textbox', { name: 'Link address' }).fill('javascript:alert(1)');
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page.getByText('Use a web or email address')).toBeVisible();

    await page.getByRole('textbox', { name: 'Link address' }).fill('example.com/docs');
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(editor(page).locator('a')).toHaveAttribute('href', 'https://example.com/docs');
    await owner.context.close();
  });
});
