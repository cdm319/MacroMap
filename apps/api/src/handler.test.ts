import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import type { RecipeInput } from '@macromap/contracts';
import {
  HouseholdPeopleMismatchError,
  type HouseholdRepository,
  type RecipeImportRepository,
  type RecipeRepository,
} from '@macromap/database';
import { describe, expect, it, vi } from 'vitest';
import { handleRequest, type ApplicationDependencies } from './handler.js';
import {
  InvalidRecipePhotoError,
  type RecipePhotoStore,
} from './recipe-photo-store.js';
import {
  RemoteRecipeError,
  type RecipeSourceFetcher,
} from './recipe-source-fetcher.js';

const session = {
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
      macroTargets: null,
      slug: 'alex',
    },
  ],
} as const;

function createRepository(
  overrides: Partial<HouseholdRepository> = {},
  recipeOverrides: Partial<RecipeRepository> = {},
  photoOverrides: Partial<RecipePhotoStore> = {},
  importOverrides: Partial<RecipeImportRepository> = {},
  sourceOverrides: Partial<RecipeSourceFetcher> = {},
): ApplicationDependencies {
  return {
    households: {
      findBySubject: vi.fn().mockResolvedValue(session),
      updateSettings: vi.fn().mockResolvedValue(session),
      ...overrides,
    },
    imports: {
      create: vi.fn().mockResolvedValue(true),
      find: vi.fn().mockResolvedValue(undefined),
      markSaved: vi.fn().mockResolvedValue(true),
      ...importOverrides,
    },
    photos: {
      completeUpload: vi.fn(),
      createUpload: vi
        .fn()
        .mockResolvedValue('https://photos.example.test/upload'),
      delete: vi.fn(),
      publishImport: vi.fn(),
      stageImport: vi.fn(),
      viewUrl: vi.fn().mockResolvedValue('https://photos.example.test/recipe'),
      ...photoOverrides,
    },
    recipes: {
      archive: vi.fn().mockResolvedValue(true),
      find: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
      save: vi.fn(),
      setPhoto: vi.fn().mockResolvedValue(true),
      ...recipeOverrides,
    },
    sources: {
      page: vi.fn(),
      photo: vi.fn(),
      ...sourceOverrides,
    },
  };
}

function event(
  routeKey: string,
  options: {
    body?: unknown;
    pathParameters?: Record<string, string>;
    queryStringParameters?: Record<string, string>;
    subject?: string;
  } = {},
): APIGatewayProxyEventV2WithJWTAuthorizer {
  return {
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    pathParameters: options.pathParameters,
    queryStringParameters: options.queryStringParameters,
    requestContext: {
      authorizer: {
        jwt: {
          claims: options.subject === undefined ? {} : { sub: options.subject },
          scopes: [],
        },
      },
      requestId: 'request-123',
    },
    routeKey,
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

describe('authenticated household API', () => {
  it('loads the household from the validated Cognito subject', async () => {
    const repository = createRepository();
    const response = await handleRequest(
      repository,
      event('GET /v1/session', { subject: 'subject-1' }),
    );

    expect(repository.households.findBySubject).toHaveBeenCalledWith(
      'subject-1',
    );
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body ?? '{}')).toEqual(session);
  });

  it('does not query without a validated subject', async () => {
    const repository = createRepository();
    const response = await handleRequest(repository, event('GET /v1/session'));

    expect(repository.households.findBySubject).not.toHaveBeenCalled();
    expect(repository.households.updateSettings).not.toHaveBeenCalled();
    expect(response.statusCode).toBe(401);
  });

  it('rejects an identity that has not been linked', async () => {
    const response = await handleRequest(
      createRepository({
        findBySubject: vi.fn().mockResolvedValue(undefined),
      }),
      event('GET /v1/session', { subject: 'unknown-subject' }),
    );

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body ?? '{}')).toMatchObject({
      error: { code: 'ACCOUNT_NOT_BOOTSTRAPPED' },
    });
  });

  it('returns a retryable waking response for database failures', async () => {
    const response = await handleRequest(
      createRepository({
        findBySubject: vi.fn().mockRejectedValue(new Error('database paused')),
      }),
      event('GET /v1/session', { subject: 'subject-1' }),
    );

    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response.body ?? '{}')).toMatchObject({
      error: { code: 'DATABASE_WAKING' },
    });
  });

  it('does not expose invalid persisted session data', async () => {
    const response = await handleRequest(
      createRepository({
        findBySubject: vi.fn().mockResolvedValue({
          household: { displayName: '', id: 'not-a-uuid' },
          people: [],
        }),
      }),
      event('GET /v1/session', { subject: 'subject-1' }),
    );

    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body ?? '{}')).toMatchObject({
      error: { code: 'INTERNAL_ERROR' },
    });
  });

  it('validates and saves the complete household settings', async () => {
    const repository = createRepository();
    const settings = {
      people: session.people.map(({ id }) => ({
        id,
        macroTargets: {
          carbsGrams: 250,
          fatGrams: 70,
          kcal: 2_200,
          proteinGrams: 160,
        },
      })),
      snackReserve: 0.15,
    };
    const response = await handleRequest(
      repository,
      event('PUT /v1/household-settings', {
        body: settings,
        subject: 'subject-1',
      }),
    );

    expect(repository.households.updateSettings).toHaveBeenCalledWith(
      'subject-1',
      settings,
    );
    expect(response.statusCode).toBe(200);
  });

  it('rejects incomplete settings and changed household profiles', async () => {
    const repository = createRepository({
      updateSettings: vi
        .fn()
        .mockRejectedValue(new HouseholdPeopleMismatchError()),
    });
    const invalidResponse = await handleRequest(
      repository,
      event('PUT /v1/household-settings', {
        body: { people: [], snackReserve: 0.15 },
        subject: 'subject-1',
      }),
    );
    const changedResponse = await handleRequest(
      repository,
      event('PUT /v1/household-settings', {
        body: {
          people: [
            {
              id: session.people[0]?.id,
              macroTargets: session.people[0]?.macroTargets,
            },
          ],
          snackReserve: 0.15,
        },
        subject: 'subject-1',
      }),
    );

    expect(invalidResponse.statusCode).toBe(400);
    expect(changedResponse.statusCode).toBe(400);
    expect(JSON.parse(changedResponse.body ?? '{}')).toMatchObject({
      error: { code: 'HOUSEHOLD_CHANGED' },
    });
  });

  it('lists recipes for the authenticated subject', async () => {
    const repository = createRepository();
    const response = await handleRequest(
      repository,
      event('GET /v1/recipes', { subject: 'subject-1' }),
    );

    expect(repository.recipes.list).toHaveBeenCalledWith(
      'subject-1',
      undefined,
    );
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body ?? '{}')).toEqual({
      items: [],
      nextCursor: null,
    });
  });

  it('estimates missing nutrition before saving a recipe', async () => {
    const recipeId = '00000000-0000-4000-8000-000000000201';
    const input = recipeInput();
    const repository = createRepository(
      {},
      {
        save: vi.fn().mockResolvedValue({
          ...input,
          id: recipeId,
          nutrition: pastaNutrition,
          nutritionProvenance: pastaProvenance,
          photoUpdatedAt: null,
          planningStatus: 'ready',
          updatedAt: '2026-08-17T12:00:00.000Z',
        }),
      },
    );
    const response = await handleRequest(
      repository,
      event('PUT /v1/recipes/{recipeId}', {
        body: input,
        pathParameters: { recipeId },
        subject: 'subject-1',
      }),
    );

    expect(repository.recipes.save).toHaveBeenCalledWith(
      'subject-1',
      recipeId,
      { ...input, nutrition: pastaNutrition },
      pastaProvenance,
    );
    expect(response.statusCode).toBe(200);
  });

  it('saves a recipe without meal types as library-only', async () => {
    const recipeId = '00000000-0000-4000-8000-000000000202';
    const input = recipeInput({
      mealTypes: [],
      nutrition: pastaNutrition,
      title: 'Library-only recipe',
    });
    const repository = createRepository(
      {},
      {
        save: vi.fn().mockResolvedValue({
          ...input,
          id: recipeId,
          nutritionProvenance: {
            confidence: 'confirmed',
            source: 'manual',
          },
          photoUpdatedAt: null,
          planningStatus: 'library-only',
          updatedAt: '2026-08-20T12:00:00.000Z',
        }),
      },
    );

    const response = await handleRequest(
      repository,
      event('PUT /v1/recipes/{recipeId}', {
        body: input,
        pathParameters: { recipeId },
        subject: 'subject-1',
      }),
    );

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body ?? '{}')).toMatchObject({
      mealTypes: [],
      planningStatus: 'library-only',
    });
  });

  it('creates a review preview before importing Schema.org JSON', async () => {
    const repository = createRepository();
    const content = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Recipe',
      name: 'Tomato pasta',
      recipeCategory: 'Dinner',
      recipeIngredient: ['200g pasta'],
      recipeYield: '2 servings',
    });
    const response = await handleRequest(
      repository,
      event('POST /v1/recipe-imports/preview', {
        body: { content },
        subject: 'subject-1',
      }),
    );
    const body = JSON.parse(response.body ?? '{}') as {
      importId: string;
      kind: string;
    };

    expect(response.statusCode).toBe(201);
    expect(body.kind).toBe('preview');
    expect(repository.imports.create).toHaveBeenCalledWith(
      'subject-1',
      body.importId,
      content,
      expect.objectContaining({ title: 'Tomato pasta' }),
      expect.any(Array),
    );
    expect(repository.sources.page).not.toHaveBeenCalled();
    expect(repository.sources.photo).not.toHaveBeenCalled();
    expect(repository.recipes.save).not.toHaveBeenCalled();
  });

  it('fetches a recipe URL and stages only its primary photo', async () => {
    const photoBytes = Uint8Array.from([0xff, 0xd8, 0xff, 0x00]);
    const repository = createRepository(
      {},
      {},
      {},
      {},
      {
        page: vi.fn().mockResolvedValue({
          content: `<html><script type="application/ld+json">${JSON.stringify({
            '@type': 'Recipe',
            image: ['/primary.jpg', '/extra.jpg'],
            name: 'Tomato pasta',
            recipeCategory: 'Dinner',
            recipeIngredient: ['200g pasta'],
            recipeYield: '2 servings',
          })}</script></html>`,
          finalUrl: 'https://recipes.example.test/tomato-pasta',
          kind: 'html',
        }),
        photo: vi.fn().mockResolvedValue({
          bytes: photoBytes,
          contentType: 'image/jpeg',
        }),
      },
    );
    const response = await handleRequest(
      repository,
      event('POST /v1/recipe-imports/preview', {
        body: { url: 'https://recipes.example.test/tomato-pasta' },
        subject: 'subject-1',
      }),
    );
    const body = JSON.parse(response.body ?? '{}') as {
      draft: { photoStaged: boolean; photoUrl: string; source: unknown };
      importId: string;
    };

    expect(response.statusCode).toBe(201);
    expect(body.draft).toMatchObject({
      photoStaged: true,
      photoUrl: 'https://recipes.example.test/primary.jpg',
      source: { url: 'https://recipes.example.test/tomato-pasta' },
    });
    expect(repository.sources.photo).toHaveBeenCalledWith(
      'https://recipes.example.test/primary.jpg',
    );
    expect(repository.photos.stageImport).toHaveBeenCalledWith(
      body.importId,
      photoBytes,
      'image/jpeg',
    );
    expect(repository.imports.create).toHaveBeenCalledWith(
      'subject-1',
      body.importId,
      expect.stringContaining('Tomato pasta'),
      expect.objectContaining({ photoStaged: true }),
      expect.not.arrayContaining([
        expect.objectContaining({ code: 'PHOTO_NOT_COPIED' }),
      ]),
    );
  });

  it('returns a safe error when a recipe URL cannot be fetched', async () => {
    const repository = createRepository(
      {},
      {},
      {},
      {},
      {
        page: vi
          .fn()
          .mockRejectedValue(
            new RemoteRecipeError(
              'REMOTE_URL_BLOCKED',
              'That URL cannot be imported.',
            ),
          ),
      },
    );
    const response = await handleRequest(
      repository,
      event('POST /v1/recipe-imports/preview', {
        body: { url: 'http://127.0.0.1/recipe' },
        subject: 'subject-1',
      }),
    );

    expect(response.statusCode).toBe(422);
    expect(JSON.parse(response.body ?? '{}')).toMatchObject({
      error: { code: 'REMOTE_URL_BLOCKED' },
    });
    expect(repository.imports.create).not.toHaveBeenCalled();
  });

  it('saves a reviewed import and publishes its staged photo', async () => {
    const importId = '00000000-0000-4000-8000-000000000301';
    const recipeId = importId;
    const input = {
      description: '',
      ingredients: [
        {
          name: 'Pasta',
          preparationNote: '',
          quantity: 200,
          unit: 'g',
        },
      ],
      instructions: [],
      mealTypes: ['dinner'] as const,
      nutrition: null,
      servingCount: 2,
      source: null,
      tags: { cuisines: [], flavours: [], proteins: [] },
      title: 'Tomato pasta',
    };
    const repository = createRepository(
      {},
      { save: vi.fn().mockResolvedValue(storedRecipe(recipeId)) },
      {},
      {
        find: vi.fn().mockResolvedValue({
          draft: {
            ...input,
            nutritionProvenance: null,
            photoStaged: true,
            photoUrl: 'https://images.example.test/pasta.jpg',
          },
          recipeId: null,
          warnings: [],
        }),
      },
    );
    const response = await handleRequest(
      repository,
      event('POST /v1/recipe-imports/{importId}/save', {
        body: { recipe: input },
        pathParameters: { importId },
        subject: 'subject-1',
      }),
    );

    expect(response.statusCode).toBe(200);
    expect(repository.recipes.save).toHaveBeenCalledWith(
      'subject-1',
      recipeId,
      { ...input, nutrition: pastaNutrition },
      pastaProvenance,
    );
    expect(repository.imports.markSaved).toHaveBeenCalledWith(
      'subject-1',
      importId,
      recipeId,
    );
    expect(repository.photos.publishImport).toHaveBeenCalledWith(
      recipeId,
      importId,
    );
    expect(repository.recipes.setPhoto).toHaveBeenCalledWith(
      'subject-1',
      recipeId,
      expect.any(Date),
    );
    expect(JSON.parse(response.body ?? '{}')).toMatchObject({
      photoUrl: 'https://photos.example.test/recipe',
    });
  });

  it('archives only a recipe owned by the authenticated household', async () => {
    const recipeId = '00000000-0000-4000-8000-000000000201';
    const repository = createRepository();
    const response = await handleRequest(
      repository,
      event('DELETE /v1/recipes/{recipeId}', {
        pathParameters: { recipeId },
        subject: 'subject-1',
      }),
    );

    expect(repository.recipes.archive).toHaveBeenCalledWith(
      'subject-1',
      recipeId,
    );
    expect(response.statusCode).toBe(204);
  });

  it('creates a short-lived upload for an owned recipe', async () => {
    const recipeId = '00000000-0000-4000-8000-000000000201';
    const repository = createRepository(
      {},
      { find: vi.fn().mockResolvedValue(storedRecipe(recipeId)) },
    );
    const response = await handleRequest(
      repository,
      event('POST /v1/recipes/{recipeId}/photos', {
        body: { contentType: 'image/jpeg', sizeBytes: 1_024 },
        pathParameters: { recipeId },
        subject: 'subject-1',
      }),
    );
    const body = JSON.parse(response.body ?? '{}') as {
      uploadId: string;
      uploadUrl: string;
    };

    expect(response.statusCode).toBe(201);
    expect(body.uploadId).toMatch(/^[0-9a-f-]{36}$/u);
    expect(body.uploadUrl).toBe('https://photos.example.test/upload');
    expect(repository.photos.createUpload).toHaveBeenCalledWith(
      recipeId,
      body.uploadId,
      'image/jpeg',
    );
  });

  it('publishes only a validated photo for an owned recipe', async () => {
    const recipeId = '00000000-0000-4000-8000-000000000201';
    const uploadId = '00000000-0000-4000-8000-000000000301';
    const repository = createRepository(
      {},
      { find: vi.fn().mockResolvedValue(storedRecipe(recipeId)) },
    );
    const response = await handleRequest(
      repository,
      event('PUT /v1/recipes/{recipeId}/photos/{uploadId}', {
        pathParameters: { recipeId, uploadId },
        subject: 'subject-1',
      }),
    );

    expect(response.statusCode).toBe(200);
    expect(repository.photos.completeUpload).toHaveBeenCalledWith(
      recipeId,
      uploadId,
    );
    expect(repository.recipes.setPhoto).toHaveBeenCalledWith(
      'subject-1',
      recipeId,
      expect.any(Date),
    );
    expect(JSON.parse(response.body ?? '{}')).toEqual({
      photoUrl: 'https://photos.example.test/recipe',
    });
  });

  it('rejects a staged upload whose contents are not a supported image', async () => {
    const recipeId = '00000000-0000-4000-8000-000000000201';
    const uploadId = '00000000-0000-4000-8000-000000000301';
    const response = await handleRequest(
      createRepository(
        {},
        { find: vi.fn().mockResolvedValue(storedRecipe(recipeId)) },
        {
          completeUpload: vi
            .fn()
            .mockRejectedValue(new InvalidRecipePhotoError()),
        },
      ),
      event('PUT /v1/recipes/{recipeId}/photos/{uploadId}', {
        pathParameters: { recipeId, uploadId },
        subject: 'subject-1',
      }),
    );

    expect(response.statusCode).toBe(422);
    expect(JSON.parse(response.body ?? '{}')).toMatchObject({
      error: { code: 'INVALID_RECIPE_PHOTO' },
    });
  });

  it('removes a photo only after checking recipe ownership', async () => {
    const recipeId = '00000000-0000-4000-8000-000000000201';
    const repository = createRepository(
      {},
      { find: vi.fn().mockResolvedValue(storedRecipe(recipeId)) },
    );
    const response = await handleRequest(
      repository,
      event('DELETE /v1/recipes/{recipeId}/photos', {
        pathParameters: { recipeId },
        subject: 'subject-1',
      }),
    );

    expect(response.statusCode).toBe(204);
    expect(repository.photos.delete).toHaveBeenCalledWith(recipeId);
    expect(repository.recipes.setPhoto).toHaveBeenCalledWith(
      'subject-1',
      recipeId,
      null,
    );
  });
});

function storedRecipe(recipeId: string) {
  return {
    ...recipeInput(),
    id: recipeId,
    instructions: ['Boil the pasta.'],
    nutritionProvenance: null,
    photoUpdatedAt: null,
    planningStatus: 'needs-nutrition' as const,
    updatedAt: '2026-08-17T12:00:00.000Z',
  };
}

function recipeInput(overrides: Partial<RecipeInput> = {}): RecipeInput {
  return {
    description: 'A quick dinner.',
    ingredients: [
      {
        name: 'Pasta',
        preparationNote: '',
        quantity: 200,
        unit: 'g',
      },
    ],
    instructions: [],
    mealTypes: ['dinner'],
    nutrition: null,
    servingCount: 2,
    source: null,
    tags: { cuisines: ['Italian'], flavours: [], proteins: [] },
    title: 'Tomato pasta',
    ...overrides,
  };
}

const pastaNutrition = {
  carbsGrams: 75.6,
  fatGrams: 1.6,
  kcal: 343,
  proteinGrams: 11.3,
};

const pastaProvenance = {
  confidence: 'medium' as const,
  matches: [
    {
      canonicalName: 'pasta',
      foodCode: '11-716',
      foodName: 'Pasta, white, dried, raw',
      foodSource: 'cofid' as const,
      foodVersion: '2021',
      grams: 200,
      ingredientIndex: 0,
      matchConfidence: 'medium' as const,
      quantitySource: 'metric' as const,
    },
  ],
  source: 'nutrition_database' as const,
};
