import type { Locator, Page } from '@playwright/test';
import { createWorkspace, DEMO_VIEWER, expect, signIn, test } from './fixtures';

const tree = (page: Page) => page.getByRole('tree', { name: 'Pages' });
const treeItem = (page: Page, title: string) =>
  tree(page)
    .getByRole('treeitem')
    .filter({ has: page.getByRole('link', { name: title }) });
const titles = async (page: Page) =>
  (await tree(page).getByRole('link').allInnerTexts()).map((text) => text.trim());

async function newPage(page: Page, title: string, parent?: string) {
  if (parent) {
    await page.getByRole('button', { name: `Add a page inside ${parent}` }).click();
  } else {
    await page.getByRole('complementary').getByRole('button', { name: 'New page' }).click();
  }
  await page.waitForURL(/\/d\/[0-9a-f-]{36}$/);
  const untitled = tree(page).getByRole('link', { name: 'Untitled' }).first();
  await untitled.hover();
  await page.getByRole('button', { name: 'Actions for Untitled' }).first().click();
  await page.getByRole('menuitem', { name: 'Rename' }).click();
  const input = tree(page).getByRole('textbox', { name: 'Page title' });
  await input.fill(title);
  await input.press('Enter');
  await expect(tree(page).getByRole('link', { name: title })).toBeVisible();
}

async function drag(page: Page, handle: Locator, dx: number, dy: number) {
  const box = (await handle.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 2, y + 2, { steps: 2 });
  await page.mouse.move(x + dx, y + dy, { steps: 12 });
  await page.mouse.up();
}

test.describe('workspace', () => {
  test('creates a workspace and nested pages that survive a reload', async ({ page, signedIn }) => {
    await createWorkspace(page, 'Product team');
    await expect(page.getByRole('heading', { name: 'Product team' })).toBeVisible();
    await expect(page.getByText('No pages yet. Create the first one.').first()).toBeVisible();

    await newPage(page, 'Roadmap');
    await newPage(page, 'Q4 goals', 'Roadmap');

    await expect(treeItem(page, 'Q4 goals')).toHaveAttribute('aria-level', '2');
    await page.reload();
    await expect(treeItem(page, 'Roadmap')).toHaveAttribute('aria-expanded', 'true');
    await expect(treeItem(page, 'Q4 goals')).toHaveAttribute('aria-level', '2');
    expect(signedIn.email).toContain('@e2e.test');
  });

  test('reorders and nests pages with drag and drop', async ({ page, signedIn: _ }) => {
    await createWorkspace(page, 'Drag team');
    for (const title of ['Alpha', 'Beta', 'Gamma']) {
      await newPage(page, title);
    }
    expect(await titles(page)).toEqual(['Alpha', 'Beta', 'Gamma']);

    const gamma = page.getByRole('button', { name: 'Move Gamma' });
    await treeItem(page, 'Gamma').hover();
    const rowHeight = (await treeItem(page, 'Alpha').boundingBox())!.height;
    await drag(page, gamma, 0, -rowHeight * 2.2);
    await expect.poll(() => titles(page)).toEqual(['Gamma', 'Alpha', 'Beta']);

    await treeItem(page, 'Beta').hover();
    await drag(page, page.getByRole('button', { name: 'Move Beta' }), 40, 0);
    await expect(treeItem(page, 'Beta')).toHaveAttribute('aria-level', '2');

    await page.reload();
    expect(await titles(page)).toEqual(['Gamma', 'Alpha', 'Beta']);
    await expect(treeItem(page, 'Beta')).toHaveAttribute('aria-level', '2');
  });

  test('deletes a page with its subpages after confirmation', async ({ page, signedIn: _ }) => {
    await createWorkspace(page, 'Cleanup team');
    await newPage(page, 'Old notes');
    await newPage(page, 'Draft', 'Old notes');
    await newPage(page, 'Keep');

    await treeItem(page, 'Old notes').hover();
    await page.getByRole('button', { name: 'Actions for Old notes' }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('its 1 subpage will be deleted');
    await dialog.getByRole('button', { name: 'Delete' }).click();

    await expect.poll(() => titles(page)).toEqual(['Keep']);
  });

  test('leaves the deleted page when it was open', async ({ page, signedIn: _ }) => {
    const workspaceId = await createWorkspace(page, 'Open page team');
    await newPage(page, 'Current');

    await treeItem(page, 'Current').hover();
    await page.getByRole('button', { name: 'Actions for Current' }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();

    await expect(page).toHaveURL(`/w/${workspaceId}`);
  });

  test('manages the workspace in settings with server actions', async ({ page, signedIn }) => {
    await createWorkspace(page, 'Settings team');
    await page.getByRole('link', { name: 'Settings', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await expect(page.getByText('1 of 3 seats used')).toBeVisible();
    await expect(page.getByRole('cell', { name: `${signedIn.name} (you)` })).toBeVisible();

    const name = page.getByRole('textbox', { name: 'Name' });
    await name.fill('Renamed team');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Workspace renamed' })).toBeVisible();
    await expect(page.getByRole('complementary').getByText('Renamed team')).toBeVisible();

    const invite = async (email: string) => {
      await page.getByLabel('Email').fill(email);
      await page.getByRole('button', { name: 'Send invite' }).click();
    };
    await invite('first@e2e.test');
    await expect(
      page.getByRole('status').filter({ hasText: 'Invitation sent to first@e2e.test' }),
    ).toBeVisible();
    await invite('second@e2e.test');
    await expect(page.getByRole('cell', { name: 'second@e2e.test', exact: true })).toBeVisible();

    await invite('third@e2e.test');
    await expect(page.getByText(/Free plan allows up to 3 members/)).toBeVisible();

    await page.getByRole('button', { name: 'Revoke invitation for first@e2e.test' }).click();
    await expect(page.getByRole('cell', { name: 'first@e2e.test', exact: true })).toBeHidden();
  });

  test('validates settings forms on the server', async ({ page, signedIn: _ }) => {
    await createWorkspace(page, 'Validation team');
    await page.getByRole('link', { name: 'Settings', exact: true }).click();
    await page.getByLabel('Email').fill('nope');
    await page.getByRole('button', { name: 'Send invite' }).click();
    await expect(page.getByText('Enter a valid email')).toBeVisible();
  });

  test('shows the workspace read only to a viewer', async ({ page }) => {
    await signIn(page, DEMO_VIEWER);
    await page.getByRole('link', { name: /Demo workspace/ }).click();
    await expect(page.getByText('You are viewer')).toBeVisible();

    await expect(tree(page).getByRole('link').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'New page' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Move / })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Actions for / })).toHaveCount(0);

    await page.getByRole('link', { name: 'Settings', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Send invite' })).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'Name' })).toBeDisabled();
  });

  test('hides workspaces from strangers', async ({ page, signedIn: _ }) => {
    await page.goto('/w/01a167a3-c56d-769a-9da3-89e7fbb0ce1f');
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  });

  test('rejects an invalid invitation link', async ({ page, signedIn: _ }) => {
    await page.goto('/invitations/accept?token=not-a-real-token');
    await page.getByRole('button', { name: 'Join workspace' }).click();
    await expect(page.getByText(/invitation is invalid or has expired/i)).toBeVisible();
  });
});
