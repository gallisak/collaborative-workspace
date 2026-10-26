import { createWorkspace, expect, test } from './fixtures';

test.describe('billing', () => {
  test('explains the plan limit and lifts it after a mock checkout', async ({
    page,
    baseURL,
    signedIn: _,
  }) => {
    const workspaceId = await createWorkspace(page, 'Growing team');
    for (const email of ['one@e2e.test', 'two@e2e.test']) {
      const response = await page.request.post(`/api/workspaces/${workspaceId}/invitations`, {
        data: { email, role: 'EDITOR' },
        headers: { origin: baseURL! },
      });
      expect(response.status()).toBe(201);
    }

    await page.getByRole('link', { name: 'Settings', exact: true }).click();
    await page.getByLabel('Email').fill('three@e2e.test');
    await page.getByRole('button', { name: 'Send invite' }).click();
    const alert = page.getByRole('alert').filter({ hasText: 'Free plan allows up to 3 members' });
    await expect(alert).toBeVisible();
    await alert.getByRole('link', { name: 'View plans' }).click();

    await expect(page).toHaveURL(`/w/${workspaceId}/billing`);
    await expect(page.getByRole('main').getByText('Free plan', { exact: true })).toBeVisible();
    await expect(page.getByText('3 of 3', { exact: true })).toBeVisible();
    await expect(page.getByText('Includes 2 pending invitations')).toBeVisible();
    await expect(page.getByRole('meter', { name: 'Members' })).toHaveAttribute(
      'aria-valuenow',
      '100',
    );

    await page.getByRole('button', { name: 'Switch to Pro' }).click();
    await expect(page).toHaveURL(/\/billing\/checkout\/[0-9a-f-]{36}$/);
    await expect(page.getByText('$8/month · Test payment')).toBeVisible();
    await page.getByRole('button', { name: 'Pay $8' }).click();

    await expect(page).toHaveURL(`/w/${workspaceId}/billing`, { timeout: 30_000 });
    await expect(page.getByRole('main').getByText('Pro plan', { exact: true })).toBeVisible();
    await expect(page.getByText(/^Renews on /)).toBeVisible();
    await expect(page.getByText('3 of 10', { exact: true })).toBeVisible();

    await page.getByRole('link', { name: 'Settings', exact: true }).click();
    await page.getByLabel('Email').fill('three@e2e.test');
    await page.getByRole('button', { name: 'Send invite' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Invitation sent to three@e2e.test' }),
    ).toBeVisible();
  });

  test('lets only admins change the plan', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('cara@collab.local');
    await page.getByLabel('Password').fill('Password123!');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.getByRole('link', { name: /Demo workspace/ }).click();
    await page.getByRole('link', { name: 'Billing', exact: true }).click();

    await expect(page.getByText('Only owners and admins can change the plan.')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Switch to/ })).toHaveCount(0);
  });
});
