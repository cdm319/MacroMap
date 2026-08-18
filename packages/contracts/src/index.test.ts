import { describe, expect, it } from 'vitest';
import {
  apiErrorSchema,
  householdSettingsSchema,
  recipeInputSchema,
  recipeImportResponseSchema,
  recipePhotoUploadRequestSchema,
  recipeSchema,
  runtimeConfigSchema,
  sessionResponseSchema,
} from './index.js';

describe('shared API contracts', () => {
  it('accepts the standard error envelope', () => {
    expect(
      apiErrorSchema.parse({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'The request could not be validated.',
          requestId: 'request-123',
        },
      }),
    ).toEqual({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'The request could not be validated.',
        requestId: 'request-123',
      },
    });
  });

  it('accepts the authenticated household session', () => {
    expect(
      sessionResponseSchema.parse({
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
      }),
    ).toMatchObject({
      people: [{ slug: 'chris' }, { slug: 'alex' }],
    });
  });

  it('requires complete, positive daily target settings', () => {
    const settings = {
      people: [
        {
          id: '00000000-0000-4000-8000-000000000101',
          macroTargets: {
            carbsGrams: 300,
            fatGrams: 80,
            kcal: 2_500,
            proteinGrams: 180,
          },
        },
      ],
      snackReserve: 0.15,
    };

    expect(householdSettingsSchema.parse(settings)).toEqual(settings);
    expect(() =>
      householdSettingsSchema.parse({
        ...settings,
        people: [
          {
            ...settings.people[0],
            macroTargets: { ...settings.people[0]?.macroTargets, kcal: 0 },
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      householdSettingsSchema.parse({ ...settings, snackReserve: 1 }),
    ).toThrow();
  });

  it('accepts local and Cognito runtime configuration', () => {
    expect(runtimeConfigSchema.parse({ mode: 'local' })).toEqual({
      mode: 'local',
    });
    expect(
      runtimeConfigSchema.parse({
        apiBaseUrl: 'https://api.example.test',
        authBaseUrl: 'https://auth.example.test',
        clientId: 'client-id',
        mode: 'cognito',
        redirectUri: 'https://macromap.example.test',
      }),
    ).toMatchObject({ mode: 'cognito' });
    expect(() => runtimeConfigSchema.parse({ mode: 'cognito' })).toThrow();
  });

  it('accepts a complete manual recipe with optional nutrition', () => {
    const input = {
      description: 'A quick pasta dinner.',
      ingredients: [
        {
          name: 'Pasta',
          preparationNote: '',
          quantity: 200,
          unit: 'g',
        },
      ],
      instructions: ['Boil the pasta.'],
      mealTypes: ['dinner'],
      nutrition: null,
      servingCount: 2,
      source: null,
      tags: {
        cuisines: ['Italian'],
        flavours: ['Fresh'],
        proteins: [],
      },
      title: 'Tomato pasta',
    };

    expect(recipeInputSchema.parse(input)).toEqual(input);
    expect(
      recipeInputSchema.parse({ ...input, instructions: [] }).instructions,
    ).toEqual([]);
    expect(
      recipeSchema.parse({
        ...input,
        id: '00000000-0000-4000-8000-000000000201',
        photoUrl: null,
        planningStatus: 'needs-nutrition',
        updatedAt: '2026-08-17T12:00:00.000Z',
      }),
    ).toMatchObject({ title: 'Tomato pasta' });
  });

  it('accepts only bounded supported recipe photos', () => {
    expect(
      recipePhotoUploadRequestSchema.parse({
        contentType: 'image/webp',
        sizeBytes: 5 * 1024 * 1024,
      }),
    ).toEqual({ contentType: 'image/webp', sizeBytes: 5 * 1024 * 1024 });
    expect(() =>
      recipePhotoUploadRequestSchema.parse({
        contentType: 'image/gif',
        sizeBytes: 1_024,
      }),
    ).toThrow();
    expect(() =>
      recipePhotoUploadRequestSchema.parse({
        contentType: 'image/jpeg',
        sizeBytes: 5 * 1024 * 1024 + 1,
      }),
    ).toThrow();
  });

  it('rejects a recipe without usable portions or ingredients', () => {
    expect(() =>
      recipeInputSchema.parse({
        description: '',
        ingredients: [],
        instructions: ['Cook it.'],
        mealTypes: ['dinner'],
        nutrition: null,
        servingCount: 0,
        source: null,
        tags: { cuisines: [], flavours: [], proteins: [] },
        title: 'Incomplete',
      }),
    ).toThrow();
  });

  it('accepts incomplete import drafts only as review previews', () => {
    const preview = {
      draft: {
        description: '',
        ingredients: [
          {
            name: 'Salt to taste',
            preparationNote: '',
            quantity: null,
            unit: '',
          },
        ],
        instructions: [],
        mealTypes: [],
        nutrition: null,
        photoUrl: null,
        servingCount: null,
        source: null,
        tags: { cuisines: [], flavours: [], proteins: [] },
        title: 'Seasoning',
      },
      importId: '00000000-0000-4000-8000-000000000301',
      kind: 'preview',
      warnings: [
        {
          code: 'INGREDIENT_REVIEW_NEEDED',
          message: 'Confirm this ingredient.',
        },
      ],
    };

    expect(recipeImportResponseSchema.parse(preview)).toEqual(preview);
    expect(() => recipeInputSchema.parse(preview.draft)).toThrow();
    expect(() =>
      recipeInputSchema.parse({
        ...preview.draft,
        ingredients: [
          {
            name: 'Salt',
            preparationNote: '',
            quantity: 1,
            unit: 'tsp',
          },
        ],
        mealTypes: ['dinner'],
        servingCount: 2,
        source: { name: 'Unsafe', url: 'javascript:alert(1)' },
      }),
    ).toThrow();
  });
});
