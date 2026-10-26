import type { Page } from '@playwright/test';
import { createDocument, documentText, editor, openEditor, openSession, share } from './documents';
import { expect, test } from './fixtures';

const history = (page: Page) => page.getByRole('region', { name: 'Version history' });

test.describe('version history', () => {
  test('saves a version, previews it and restores it for everyone', async ({
    browser,
    baseURL,
  }) => {
    const owner = await openSession(browser, baseURL!, 'Ann Owner');
    const guest = await openSession(browser, baseURL!, 'Bob Guest');
    const { url, documentId } = await createDocument(owner, baseURL!, 'Plan');
    await share(owner, baseURL!, documentId, guest.email, 'EDIT');
    await openEditor(owner.page, url);
    await openEditor(guest.page, url);
    const { page } = owner;

    await editor(page).click();
    await page.keyboard.type('First draft');
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: 'History', exact: true }).click();
    await history(page).getByRole('textbox', { name: 'Version name' }).fill('Draft 1');
    await history(page).getByRole('button', { name: 'Save version' }).click();
    await expect(history(page).getByRole('button', { name: /Draft 1/ })).toBeVisible();

    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.type(' plus later changes');
    await expect.poll(() => documentText(guest.page)).toContain('plus later changes');

    await history(page)
      .getByRole('button', { name: /Draft 1/ })
      .click();
    const preview = history(page).getByRole('textbox', { name: 'Version content' });
    await expect(preview).toHaveText('First draft');
    await expect(preview).toHaveAttribute('contenteditable', 'false');

    await history(page).getByRole('button', { name: 'Restore this version' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Restore' }).click();

    await expect(editor(page)).toHaveText('First draft');
    await expect(editor(guest.page)).toHaveText('First draft');
    await expect(history(page).getByRole('button', { name: /Before restore/ })).toBeVisible();
    await owner.context.close();
    await guest.context.close();
  });

  test('shows history to viewers without save or restore', async ({ browser, baseURL }) => {
    const owner = await openSession(browser, baseURL!, 'Ann Owner');
    const viewer = await openSession(browser, baseURL!, 'Cara Viewer');
    const { url, documentId } = await createDocument(owner, baseURL!, 'Read only history');
    await share(owner, baseURL!, documentId, viewer.email, 'VIEW');
    await openEditor(owner.page, url);
    await editor(owner.page).click();
    await owner.page.keyboard.type('Snapshot me');
    await owner.page.waitForTimeout(1200);
    await owner.page.getByRole('button', { name: 'History', exact: true }).click();
    await history(owner.page).getByRole('button', { name: 'Save version' }).click();
    await expect(history(owner.page).getByRole('listitem')).toHaveCount(1);

    await openEditor(viewer.page, url, { writable: false });
    await viewer.page.getByRole('button', { name: 'History', exact: true }).click();
    await history(viewer.page)
      .getByRole('button', { name: /Saved version/ })
      .click();
    await expect(history(viewer.page).getByRole('textbox', { name: 'Version content' })).toHaveText(
      'Snapshot me',
    );
    await expect(history(viewer.page).getByRole('button', { name: 'Save version' })).toHaveCount(0);
    await expect(
      history(viewer.page).getByRole('button', { name: 'Restore this version' }),
    ).toHaveCount(0);
    await owner.context.close();
    await viewer.context.close();
  });
});
