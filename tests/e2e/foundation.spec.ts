import { expect, test } from '@playwright/test';

test('shows the private household foundation', async ({ page }) => {
  await page.goto('/');

  await expect(
    page.getByRole('heading', { level: 1, name: 'Welcome home.' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Chris & Alex' }),
  ).toBeVisible();
  await expect(page.getByText('Chris', { exact: true })).toBeVisible();
  await expect(page.getByText('Alex', { exact: true })).toBeVisible();
  await expect(page.getByText('Personal portions enabled')).toHaveCount(2);
});

test('keeps an unauthenticated household behind sign-in', async ({ page }) => {
  await page.route('**/config.json', (route) =>
    route.fulfill({
      contentType: 'application/json',
      json: {
        apiBaseUrl: 'https://api.example.test',
        authBaseUrl: 'https://auth.example.test',
        clientId: 'client-id',
        mode: 'cognito',
        redirectUri: 'http://127.0.0.1:3000/',
      },
    }),
  );

  await page.goto('/');

  await expect(
    page.getByRole('heading', { level: 1, name: 'Your meals, mapped.' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Sign in to MacroMap' }),
  ).toBeVisible();
});

test('explains an auto-paused database and offers a retry', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem(
      'macromap.tokens',
      JSON.stringify({
        accessToken: 'test-access-token',
        expiresAt: Date.now() + 60_000,
      }),
    );
  });
  await page.route('**/config.json', (route) =>
    route.fulfill({
      contentType: 'application/json',
      json: {
        apiBaseUrl: 'https://api.example.test',
        authBaseUrl: 'https://auth.example.test',
        clientId: 'client-id',
        mode: 'cognito',
        redirectUri: 'http://127.0.0.1:3000/',
      },
    }),
  );
  await page.route('https://api.example.test/v1/session', (route) =>
    route.fulfill({
      contentType: 'application/json',
      json: {
        error: {
          code: 'DATABASE_WAKING',
          message: 'MacroMap is waking its database.',
        },
      },
      status: 503,
    }),
  );

  await page.goto('/');

  await expect(
    page.getByRole('heading', { level: 1, name: 'Waking the kitchen' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Try again now' }),
  ).toBeVisible();
});
