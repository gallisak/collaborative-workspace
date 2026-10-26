import { createDocument, editor, openEditor, openSession } from './documents';
import { expect, test } from './fixtures';

test('finds pages by their text once the index catches up', async ({ browser, baseURL }) => {
  const owner = await openSession(browser, baseURL!, 'Owner Searcher');
  const { workspaceId, documentId, url } = await createDocument(owner, baseURL!, 'Quarterly plan');
  const { page } = owner;
  await openEditor(page, url);
  await editor(page).click();
  await page.keyboard.type('Hire a designer before the marmalade launch');

  await page.getByRole('link', { name: 'Search', exact: true }).click();
  await expect(page.getByText('Search titles and text of the pages you can open.')).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search pages' }).fill('marmalade');
  await page.getByRole('search').getByRole('button', { name: 'Search' }).click();
  await expect(page).toHaveURL(`/w/${workspaceId}/search?q=marmalade`);

  const results = page.getByRole('list', { name: 'Search results' });
  await expect(async () => {
    await page.reload();
    await expect(results.getByRole('link')).toHaveCount(1, { timeout: 1000 });
  }).toPass({ timeout: 30_000 });
  await expect(results.getByRole('link')).toContainText('Quarterly plan');
  await expect(results.getByRole('link')).toContainText('marmalade launch');

  await page.getByRole('searchbox', { name: 'Search pages' }).fill('pineapple');
  await page.getByRole('search').getByRole('button', { name: 'Search' }).click();
  await expect(page.getByText('Nothing matches “pineapple”.', { exact: false })).toBeVisible();

  await page.goto(`/w/${workspaceId}/search?q=marmalade`);
  await results.getByRole('link').click();
  await expect(page).toHaveURL(`/w/${workspaceId}/d/${documentId}`);
  await owner.context.close();
});
