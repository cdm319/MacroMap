import { expect, test } from '@playwright/test';

test('shows the MacroMap foundation', async ({ page }) => {
  await page.goto('/');

  await expect(
    page.getByRole('heading', { level: 1, name: 'MacroMap foundation' }),
  ).toBeVisible();
  await expect(
    page.getByText('Authentication and the first private'),
  ).toBeVisible();
});
