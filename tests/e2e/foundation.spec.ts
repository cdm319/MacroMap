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

async function fillIngredient(
  page: Page,
  index: number,
  amount: string,
  unit: string,
  name: string,
): Promise<void> {
  await page.getByLabel(`Ingredient ${index} amount`).fill(amount);
  await page.getByLabel(`Ingredient ${index} unit`).fill(unit);
  await page.getByLabel(`Ingredient ${index} name`).fill(name);
}

test('shows the private household foundation', async ({ page }) => {
  await page.goto('/');

  await expect(
    page.getByRole('heading', { level: 1, name: 'Recipe library' }),
  ).toBeVisible();
  await expect(page.getByText('Your recipe book is empty')).toBeVisible();

  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Planning settings' }),
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

test('creates, cooks, edits, and archives a manual recipe', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Add recipe' }).click();

  await page.getByLabel('Title').fill('Tomato pasta');
  await page.getByLabel('Description').fill('A bright midweek dinner.');
  await page.getByLabel('Ingredient 1 amount').fill('200');
  await page.getByLabel('Ingredient 1 unit').fill('g');
  await page.getByLabel('Ingredient 1 name').fill('Pasta');
  await page.getByRole('button', { name: 'Add step' }).click();
  await page.getByLabel('Step 1').fill('Boil the pasta until tender.');
  await page.getByRole('button', { name: 'Save recipe' }).click();

  await expect(
    page.getByRole('heading', { level: 1, name: 'Tomato pasta' }),
  ).toBeVisible();
  await expect(
    page.getByText('Estimated from CoFID 2021 · Medium confidence'),
  ).toBeVisible();

  await page.getByLabel('Add photo').setInputFiles({
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    ),
    mimeType: 'image/png',
    name: 'tomato-pasta.png',
  });
  await expect(page.getByRole('img', { name: 'Tomato pasta' })).toBeVisible();

  await page.getByRole('button', { name: 'Start cooking' }).click();
  await page.getByLabel('Cook this many servings').fill('4');
  await expect(page.getByText(/400 g Pasta/u)).toBeVisible();
  await expect(page.getByText('Boil the pasta until tender.')).toBeVisible();
  await expect(page.getByRole('img', { name: 'Tomato pasta' })).toBeVisible();

  await page.getByRole('button', { name: 'Exit cooking mode' }).click();
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Title').fill('Summer tomato pasta');
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Summer tomato pasta' }),
  ).toBeVisible();

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Archive recipe' }).click();
  await expect(page.getByText('Your recipe book is empty')).toBeVisible();
});

test('estimates an everyday recipe after known nutrition is removed', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Add recipe' }).click();

  await page.getByLabel('Title').fill('Chicken jacket potato');
  await page.getByLabel('Servings').fill('1');
  for (let index = 0; index < 5; index += 1) {
    await page.getByRole('button', { name: 'Add ingredient' }).click();
  }
  for (const [index, amount, unit, name] of [
    [1, '1', 'unit', 'baking potatoes'],
    [2, '100', 'g', 'chicken breast'],
    [3, '1', 'tbsp', 'butter'],
    [4, '0.5', 'tsp', 'extra virgin olive oil'],
    [5, '30', 'g', 'grated cheddar cheese'],
    [6, '415', 'g', 'Heinz baked beans'],
  ] as const) {
    await fillIngredient(page, index, amount, unit, name);
  }
  await page.getByLabel('Add known nutrition').check();
  await page.getByLabel('Per serving Calories').fill('900');
  await page.getByLabel('Per serving Protein').fill('57');
  await page.getByLabel('Per serving Carbs').fill('111');
  await page.getByLabel('Per serving Fat').fill('28');
  await page.getByRole('button', { name: 'Save recipe' }).click();

  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Add known nutrition').uncheck();
  await page.getByRole('button', { name: 'Save recipe' }).click();

  await expect(
    page.getByText('Estimated from CoFID 2021 · Low confidence'),
  ).toBeVisible();
  await page.getByText('How this was estimated').click();
  await expect(page.getByText(/baking potatoes.*250 g assumed/u)).toBeVisible();
});

test('saves a recipe without instructions and adds them later', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Add recipe' }).click();

  await page.getByLabel('Title').fill('Pan-fried halloumi');
  await page.getByLabel('Ingredient 1 amount').fill('200');
  await page.getByLabel('Ingredient 1 unit').fill('g');
  await page.getByLabel('Ingredient 1 name').fill('Halloumi');
  await page.getByRole('button', { name: 'Save recipe' }).click();

  await expect(page.getByText('No instructions added yet.')).toBeVisible();
  await page.getByRole('button', { name: 'Start cooking' }).click();
  await expect(page.getByText('No instructions added yet.')).toBeVisible();

  await page.getByRole('button', { name: 'Exit cooking mode' }).click();
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByRole('button', { name: 'Add step' }).click();
  await page.getByLabel('Step 1').fill('Fry until golden on both sides.');
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await expect(page.getByText('Fry until golden on both sides.')).toBeVisible();
});

test('reviews Schema.org JSON before saving an imported recipe', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Import JSON' }).click();
  await page.getByLabel('Schema.org Recipe JSON').fill(
    JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Recipe',
      author: { '@type': 'Person', name: 'Example Cook' },
      description: 'A quick imported dinner.',
      name: 'Imported tomato pasta',
      recipeCategory: 'Dinner',
      recipeIngredient: ['200g pasta', '400g tomatoes, chopped'],
      recipeInstructions: [{ '@type': 'HowToStep', text: 'Boil the pasta.' }],
      recipeYield: '2 servings',
      url: 'https://recipes.example.test/tomato-pasta',
    }),
  );
  await page.getByRole('button', { name: 'Review recipe' }).click();

  await expect(
    page.getByRole('heading', { name: 'Review imported recipe' }),
  ).toBeVisible();
  await expect(page.getByLabel('Title')).toHaveValue('Imported tomato pasta');
  await expect(page.getByLabel('Ingredient 1 amount')).toHaveValue('200');
  await expect(page.getByLabel('Source name (optional)')).toHaveValue(
    'Example Cook',
  );
  await expect(
    page.getByText('Current CoFID medium confidence estimate'),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Save imported recipe' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Imported tomato pasta' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Example Cook' }),
  ).toHaveAttribute('href', 'https://recipes.example.test/tomato-pasta');
  await expect(
    page.getByText('Estimated from CoFID 2021 · Medium confidence'),
  ).toBeVisible();
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
  await page.route('https://api.example.test/v1/recipes', (route) =>
    route.fulfill({
      contentType: 'application/json',
      json: { items: [], nextCursor: null },
    }),
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
  await page.getByRole('button', { name: 'Settings' }).click();
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
