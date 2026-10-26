import type { Page } from '@playwright/test';
import { createDocument, editor, openEditor, openSession, share } from './documents';
import { expect, test } from './fixtures';

const panel = (page: Page) => page.getByRole('region', { name: 'Comments' });

async function writeParagraph(page: Page, text: string) {
  await editor(page).click();
  await page.keyboard.type(text);
}

test.describe('comments and mentions', () => {
  test('comments on a block, mentions a person and notifies them', async ({ browser, baseURL }) => {
    const owner = await openSession(browser, baseURL!, 'Ann Owner');
    const guest = await openSession(browser, baseURL!, 'Bob Guest');
    const { url, documentId } = await createDocument(owner, baseURL!, 'Budget');
    await share(owner, baseURL!, documentId, guest.email, 'EDIT');
    await openEditor(owner.page, url);
    await writeParagraph(owner.page, 'Budget needs a review');

    await owner.page.getByRole('button', { name: 'Comment on block' }).click();
    const composer = panel(owner.page).getByRole('textbox', { name: /Add a comment/ });
    await composer.pressSequentially('@Bo');
    await expect(owner.page.getByRole('listbox', { name: 'People to mention' })).toContainText(
      'Bob Guest',
    );
    await composer.press('Enter');
    await composer.pressSequentially('please check the totals');
    await panel(owner.page).getByRole('button', { name: 'Comment', exact: true }).click();

    const thread = panel(owner.page).getByRole('article');
    await expect(thread).toContainText('@Bob Guest please check the totals');
    await expect(thread.locator('[data-mention]')).toHaveText('@Bob Guest');
    await expect(editor(owner.page).locator('p.has-comments')).toHaveText('Budget needs a review');
    await expect(owner.page.getByRole('button', { name: 'Comments (1)' })).toBeVisible();

    await guest.page.goto(url);
    const bell = guest.page.getByRole('button', { name: 'Notifications, 1 unread' });
    await expect(bell).toBeVisible();
    await bell.click();
    await guest.page
      .getByRole('list', { name: 'Notifications' })
      .getByRole('button', { name: /Ann Owner mentioned you in Budget/ })
      .click();
    await expect(guest.page).toHaveURL(/\?thread=/);
    await expect(panel(guest.page).getByRole('article')).toContainText('please check the totals');
    await expect(guest.page.getByRole('button', { name: 'Notifications' })).toBeVisible();

    await panel(guest.page).getByRole('button', { name: 'Reply' }).click();
    await panel(guest.page).getByRole('textbox', { name: 'Reply…' }).fill('Totals are correct');
    await panel(guest.page).getByRole('button', { name: 'Reply', exact: true }).click();
    await expect(panel(guest.page).getByRole('article')).toContainText('Totals are correct');

    await panel(guest.page).getByRole('button', { name: 'Resolve' }).click();
    await expect(panel(guest.page).getByRole('article')).toHaveCount(0);
    await panel(guest.page).getByRole('button', { name: 'Show resolved (1)' }).click();
    await expect(panel(guest.page).getByRole('article')).toContainText('Resolved by Bob Guest');
    await owner.context.close();
    await guest.context.close();
  });

  test('opens the thread when a highlighted block is clicked', async ({ browser, baseURL }) => {
    const owner = await openSession(browser, baseURL!, 'Ann Owner');
    const { url } = await createDocument(owner, baseURL!, 'Click');
    const { page } = owner;
    await openEditor(page, url);
    await writeParagraph(page, 'Discuss this');
    await page.getByRole('button', { name: 'Comment on block' }).click();
    await panel(page)
      .getByRole('textbox', { name: /Add a comment/ })
      .fill('Needs a decision');
    await panel(page).getByRole('button', { name: 'Comment', exact: true }).click();
    await expect(panel(page).getByRole('article')).toBeVisible();

    await panel(page).getByRole('button', { name: 'Close comments' }).click();
    await editor(page).locator('p.has-comments').click();

    await expect(panel(page).getByRole('article')).toContainText('Needs a decision');
    await expect(editor(page).locator('p.is-active-comment')).toHaveText('Discuss this');
    await owner.context.close();
  });

  test('lets a viewer read comments without writing them', async ({ browser, baseURL }) => {
    const owner = await openSession(browser, baseURL!, 'Ann Owner');
    const viewer = await openSession(browser, baseURL!, 'Cara Viewer');
    const { url, documentId } = await createDocument(owner, baseURL!, 'Readers');
    await share(owner, baseURL!, documentId, viewer.email, 'VIEW');
    await openEditor(owner.page, url);
    await writeParagraph(owner.page, 'Read me');
    await owner.page.getByRole('button', { name: 'Comment on block' }).click();
    await panel(owner.page)
      .getByRole('textbox', { name: /Add a comment/ })
      .fill('Visible to all');
    await panel(owner.page).getByRole('button', { name: 'Comment', exact: true }).click();
    await expect(panel(owner.page).getByRole('article')).toBeVisible();

    await openEditor(viewer.page, url);
    await viewer.page.getByRole('button', { name: 'Comments (1)' }).click();
    await expect(panel(viewer.page).getByRole('article')).toContainText('Visible to all');
    await expect(panel(viewer.page).getByRole('button', { name: 'Reply' })).toHaveCount(0);
    await expect(panel(viewer.page).getByRole('button', { name: 'Resolve' })).toHaveCount(0);
    await expect(viewer.page.getByRole('button', { name: 'Comment on block' })).toHaveCount(0);
    await owner.context.close();
    await viewer.context.close();
  });
});
