import { expect, newAccount, PASSWORD, signIn, test } from './fixtures';

test.describe('authentication', () => {
  test('sends signed out visitors to the login page and back after signing in', async ({
    page,
    account,
  }) => {
    await page.goto('/workspaces');
    await expect(page).toHaveURL('/login?next=%2Fworkspaces');

    await page.getByLabel('Email').fill(account.email);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL('/workspaces');
    await expect(page.getByRole('heading', { name: 'Your workspaces' })).toBeVisible();
  });

  test('registers a new account and starts with no workspaces', async ({ page }) => {
    const account = newAccount('Nova Writer');
    await page.goto('/register');
    await page.getByLabel('Name').fill(account.name);
    await page.getByLabel('Email').fill(account.email);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page).toHaveURL('/workspaces');
    await expect(page.getByText('You are not a member of any workspace yet')).toBeVisible();
  });

  test('validates the forms before sending them', async ({ page }) => {
    await page.goto('/register');
    await page.getByLabel('Email').fill('not-an-email');
    await page.getByLabel('Password').fill('short');
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page.getByText('Enter your name')).toBeVisible();
    await expect(page.getByText('Enter a valid email')).toBeVisible();
    await expect(page.getByText('Use at least 8 characters')).toBeVisible();
    await expect(page).toHaveURL('/register');
  });

  test('explains wrong credentials and taken emails', async ({ page, account }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(account.email);
    await page.getByLabel('Password').fill('WrongPassword1!');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert').filter({ hasText: /invalid/i })).toBeVisible();

    await page.goto('/register');
    await page.getByLabel('Name').fill('Copy');
    await page.getByLabel('Email').fill(account.email);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByText('This email is already registered')).toBeVisible();
  });

  test('keeps signed in users away from the auth pages and signs out', async ({
    page,
    account,
  }) => {
    await signIn(page, account);
    await page.goto('/login');
    await expect(page).toHaveURL('/workspaces');
    await page.goto('/');
    await expect(page).toHaveURL('/workspaces');

    await page.getByRole('button', { name: account.name }).click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(page).toHaveURL('/login');

    await page.goto('/workspaces');
    await expect(page).toHaveURL('/login?next=%2Fworkspaces');
  });

  test('refreshes an expired access token without bothering the user', async ({
    page,
    context,
    account,
  }) => {
    await signIn(page, account);
    await context.clearCookies({ name: 'access_token' });

    await page.goto('/workspaces');

    await expect(page).toHaveURL('/workspaces');
    const cookies = await context.cookies();
    expect(cookies.some((cookie) => cookie.name === 'access_token')).toBe(true);
  });

  test('ignores a next parameter pointing to another site', async ({ page, account }) => {
    await page.goto('/login?next=https://evil.example/steal');
    await page.getByLabel('Email').fill(account.email);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL('/workspaces');
  });
});
