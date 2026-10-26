import { createDocument, editor, openEditor, openSession } from './documents';
import { expect, test } from './fixtures';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

test('uploads an image straight to storage and shows it in the document', async ({
  browser,
  baseURL,
}) => {
  const owner = await openSession(browser, baseURL!, 'Owner Uploader');
  const { url } = await createDocument(owner, baseURL!, 'With a chart');
  const { page } = owner;
  await openEditor(page, url);
  await editor(page).click();

  await page
    .getByLabel('Image file')
    .setInputFiles({ name: 'chart.png', mimeType: 'image/png', buffer: PNG });

  const image = editor(page).locator('img');
  await expect(image).toHaveAttribute('src', /^\/api\/attachments\/[0-9a-f-]{36}\/content$/);
  await expect(image).toHaveAttribute('alt', 'chart.png');
  await expect
    .poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth))
    .toBe(1);

  await page.waitForTimeout(1500);
  await page.reload();
  await expect(editor(page).locator('img')).toHaveAttribute('alt', 'chart.png');

  await page
    .getByLabel('Image file')
    .setInputFiles({ name: 'page.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') });
  await expect(page.getByText('Choose a PNG, JPEG, GIF or WebP image')).toBeVisible();
  await expect(editor(page).locator('img')).toHaveCount(1);
  await owner.context.close();
});
