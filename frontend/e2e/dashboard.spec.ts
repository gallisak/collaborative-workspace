import { createWorkspace, expect, test } from './fixtures';

test.describe('workspace dashboard', () => {
  test('streams independent sections into the server rendered page', async ({ page, signedIn }) => {
    const workspaceId = await createWorkspace(page, 'Dashboard team');

    const html = await (await page.request.get(`/w/${workspaceId}`)).text();
    expect(html).toContain('aria-label="Loading members"');
    expect(html).toContain('aria-label="Loading plan usage"');
    expect(html).toContain(signedIn.name);

    const overview = page.getByRole('complementary', { name: 'Workspace overview' });
    const members = overview.getByRole('region', { name: 'Members' });
    await expect(members.getByRole('list', { name: 'Members' })).toContainText(signedIn.name);
    await expect(members.getByRole('listitem')).toContainText('Owner');

    const plan = overview.getByRole('region', { name: 'Plan usage' });
    await expect(plan.getByText('Free plan')).toBeVisible();
    await expect(plan.getByRole('meter', { name: 'Documents' })).toBeVisible();
    await expect(plan.getByText('0 of 100')).toBeVisible();

    await expect(
      overview
        .getByRole('region', { name: 'Mentions' })
        .getByText('Nobody has mentioned you here yet.'),
    ).toBeVisible();
    await expect(
      page.getByRole('main').getByText('No pages yet. Create the first one.'),
    ).toBeVisible();

    await plan.getByRole('link', { name: 'View plans' }).click();
    await expect(page).toHaveURL(`/w/${workspaceId}/billing`);
  });
});
