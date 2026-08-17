import { expect, test, type Page } from '@playwright/test';

const householdSession = {
  household: {
    displayName: 'Chris & Alex',
    id: '00000000-0000-4000-8000-000000000001',
    snackReserve: 0.15,
  },
  people: [
    {
      displayName: 'Chris',
      id: '00000000-0000-4000-8000-000000000101',
      macroTargets: {
        carbsGrams: 300,
        fatGrams: 80,
        kcal: 2_500,
        proteinGrams: 180,
      },
      slug: 'chris',
    },
    {
      displayName: 'Alex',
      id: '00000000-0000-4000-8000-000000000102',
      macroTargets: {
        carbsGrams: 230,
        fatGrams: 65,
        kcal: 2_000,
        proteinGrams: 140,
      },
      slug: 'alex',
    },
  ],
};

async function useCognitoConfig(page: Page): Promise<void> {
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
}

test('shows the private household foundation', async ({ page }) => {
  await page.goto('/');

  await expect(
    page.getByRole('heading', { level: 1, name: 'Welcome home.' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Chris & Alex' }),
  ).toBeVisible();
  await expect(page.getByRole('group', { name: 'Chris' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Alex' })).toBeVisible();
  await expect(page.getByText('Targets needed')).toHaveCount(2);

  for (const [person, values] of [
    ['Chris', ['2500', '180', '300', '80']],
    ['Alex', ['2000', '140', '230', '65']],
  ] as const) {
    for (const [field, value] of [
      ['Calories', values[0]],
      ['Protein', values[1]],
      ['Carbs', values[2]],
      ['Fat', values[3]],
    ] as const) {
      await page
        .getByRole('spinbutton', { name: `${person} ${field}` })
        .fill(value);
    }
  }
  await page.getByRole('button', { name: 'Save targets' }).click();

  await expect(page.getByText('Targets saved.')).toBeVisible();
  await expect(page.getByText('Targets ready')).toHaveCount(2);
});

test('keeps an unauthenticated household behind sign-in', async ({ page }) => {
  await useCognitoConfig(page);

  await page.goto('/');

  await expect(
    page.getByRole('heading', { level: 1, name: 'Your meals, mapped.' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Sign in to MacroMap' }),
  ).toBeVisible();
});

test('saves targets through the authenticated API', async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem(
      'macromap.tokens',
      JSON.stringify({
        accessToken: 'test-access-token',
        expiresAt: Date.now() + 60_000,
      }),
    );
  });
  await useCognitoConfig(page);
  await page.route('https://api.example.test/v1/session', (route) =>
    route.fulfill({ contentType: 'application/json', json: householdSession }),
  );

  let savedBody: unknown;
  let authorization: string | undefined;
  await page.route(
    'https://api.example.test/v1/household-settings',
    (route) => {
      savedBody = route.request().postDataJSON();
      authorization = route.request().headers().authorization;
      return route.fulfill({
        contentType: 'application/json',
        json: householdSession,
      });
    },
  );

  await page.goto('/');
  await page.getByRole('spinbutton', { name: 'Chris Calories' }).fill('2600');
  await page.getByRole('button', { name: 'Save targets' }).click();

  await expect(page.getByText('Targets saved.')).toBeVisible();
  expect(authorization).toBe('Bearer test-access-token');
  expect(savedBody).toEqual(
    expect.objectContaining({
      people: expect.arrayContaining([
        expect.objectContaining({
          id: '00000000-0000-4000-8000-000000000101',
          macroTargets: expect.objectContaining({ kcal: 2_600 }),
        }),
      ]),
      snackReserve: 0.15,
    }),
  );
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
  await useCognitoConfig(page);
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
