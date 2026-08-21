import { describe, expect, it } from 'vitest';
import {
  apiErrorSchema,
  householdSettingsSchema,
  recipeInputSchema,
  recipeImportPreviewRequestSchema,
  recipeImportResponseSchema,
  recipeListCursorSchema,
  recipeListQuerySchema,
  recipeNutritionProvenanceSchema,
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
      recipeInputSchema.parse({ ...input, mealTypes: [] }).mealTypes,
    ).toEqual([]);
    expect(
      recipeSchema.parse({
        ...input,
        id: '00000000-0000-4000-8000-000000000201',
        nutritionProvenance: null,
        photoUrl: null,
        planningStatus: 'needs-nutrition',
        updatedAt: '2026-08-17T12:00:00.000Z',
      }),
    ).toMatchObject({ title: 'Tomato pasta' });
    expect(
      recipeSchema.parse({
        ...input,
        id: '00000000-0000-4000-8000-000000000201',
        mealTypes: [],
        nutritionProvenance: null,
        photoUrl: null,
        planningStatus: 'library-only',
        updatedAt: '2026-08-20T12:00:00.000Z',
      }).planningStatus,
    ).toBe('library-only');
  });

  it('validates recipe search, sorting, and bound cursors', () => {
    expect(
      recipeListQuerySchema.parse({ search: '  chicken  ', sort: 'title' }),
    ).toEqual({ search: 'chicken', sort: 'title' });
    expect(recipeListQuerySchema.parse({})).toEqual({ sort: 'updated' });
    expect(() => recipeListQuerySchema.parse({ sort: 'newest' })).toThrow();
    expect(() => recipeListQuerySchema.parse({ filter: 'dinner' })).toThrow();

    expect(
      recipeListCursorSchema.parse({
        id: '00000000-0000-4000-8000-000000000201',
        search: 'chicken',
        sort: 'title',
        titleKey: 'lemon chicken',
        version: 1,
      }),
    ).toMatchObject({ sort: 'title', titleKey: 'lemon chicken' });
  });

  it('records nutrition quantity assumptions and negligible omissions', () => {
    const provenance = {
      confidence: 'low',
      datasetVersion: '2021',
      matches: [
        {
          canonicalName: 'baking potato',
          cofidCode: '13-489',
          cofidName: 'Potatoes, old, raw',
          grams: 250,
          ingredientIndex: 0,
          matchConfidence: 'medium',
          quantitySource: 'estimated_count',
        },
      ],
      omissions: [
        {
          ingredientIndex: 1,
          ingredientName: 'salt',
          reason: 'negligible_seasoning',
        },
      ],
      source: 'cofid',
    } as const;

    expect(recipeNutritionProvenanceSchema.parse(provenance)).toEqual(
      provenance,
    );
  });

  it('records nutrition database and label-profile matches', () => {
    const provenance = {
      confidence: 'high',
      matches: [
        {
          canonicalName: 'vanilla protein powder',
          foodCode: 'generic-protein-powder',
          foodName: 'Generic protein powder',
          foodSource: 'label',
          foodVersion: '2026-08-19',
          grams: 30,
          ingredientIndex: 0,
          matchConfidence: 'high',
          quantitySource: 'label_measure',
        },
      ],
      source: 'nutrition_database',
    } as const;

    expect(recipeNutritionProvenanceSchema.parse(provenance)).toEqual(
      provenance,
    );
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
        nutritionProvenance: null,
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

    expect(recipeImportResponseSchema.parse(preview)).toEqual({
      ...preview,
      draft: { ...preview.draft, photoStaged: false },
    });
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

  it('accepts either bounded JSON or an HTTP recipe URL for preview', () => {
    expect(
      recipeImportPreviewRequestSchema.parse({
        url: 'https://recipes.example.test/tomato-pasta',
      }),
    ).toEqual({ url: 'https://recipes.example.test/tomato-pasta' });
    expect(
      recipeImportPreviewRequestSchema.parse({ content: '{"@type":"Recipe"}' }),
    ).toEqual({ content: '{"@type":"Recipe"}' });
    expect(() =>
      recipeImportPreviewRequestSchema.parse({ url: 'file:///etc/passwd' }),
    ).toThrow();
  });
});
