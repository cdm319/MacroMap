import { z } from 'zod';

export const opaqueIdSchema = z.string().uuid();

export const apiErrorSchema = z
  .object({
    error: z
      .object({
        code: z.string().regex(/^[A-Z][A-Z0-9_]*$/u),
        details: z.record(z.string(), z.unknown()).optional(),
        message: z.string().min(1),
        requestId: z.string().min(1).optional(),
      })
      .strict(),
  })
  .strict();

export const cognitoRuntimeConfigSchema = z.object({
  apiBaseUrl: z.string(),
  authBaseUrl: z.string(),
  clientId: z.string(),
  mode: z.literal('cognito'),
  redirectUri: z.string(),
});

export const runtimeConfigSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('local') }),
  cognitoRuntimeConfigSchema,
]);

export const macroTargetsSchema = z
  .object({
    carbsGrams: z.number().nonnegative(),
    fatGrams: z.number().nonnegative(),
    kcal: z.number().int().positive(),
    proteinGrams: z.number().nonnegative(),
  })
  .strict();

export const personSummarySchema = z
  .object({
    displayName: z.string().min(1),
    id: opaqueIdSchema,
    macroTargets: macroTargetsSchema.nullable(),
    slug: z.string().regex(/^[a-z][a-z0-9-]*$/u),
  })
  .strict();

export const sessionResponseSchema = z
  .object({
    household: z
      .object({
        displayName: z.string().min(1),
        id: opaqueIdSchema,
        snackReserve: z.number().min(0).lt(1),
      })
      .strict(),
    people: z.array(personSummarySchema).min(1),
  })
  .strict();

export const householdSettingsSchema = z
  .object({
    people: z
      .array(
        z
          .object({
            id: opaqueIdSchema,
            macroTargets: macroTargetsSchema,
          })
          .strict(),
      )
      .min(1),
    snackReserve: z.number().min(0).lt(1),
  })
  .strict();

export const mealTypeSchema = z.enum(['breakfast', 'lunch', 'dinner']);

export const recipePhotoContentTypeSchema = z.enum([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export const maxRecipePhotoBytes = 5 * 1024 * 1024;

export const recipePhotoUploadRequestSchema = z
  .object({
    contentType: recipePhotoContentTypeSchema,
    sizeBytes: z.number().int().positive().max(maxRecipePhotoBytes),
  })
  .strict();

export const recipePhotoUploadResponseSchema = z
  .object({
    uploadId: opaqueIdSchema,
    uploadUrl: z.string().url(),
  })
  .strict();

export const recipePhotoResponseSchema = z
  .object({ photoUrl: z.string().url() })
  .strict();

export const recipeNutritionSchema = z
  .object({
    carbsGrams: z.number().nonnegative(),
    fatGrams: z.number().nonnegative(),
    kcal: z.number().positive(),
    proteinGrams: z.number().nonnegative(),
  })
  .strict();

const estimatedQuantitySourceSchema = z.enum([
  'metric',
  'avoirdupois',
  'household_measure',
  'estimated_count',
  'label_measure',
]);

const nutritionOmissionSchema = z
  .object({
    ingredientIndex: z.number().int().nonnegative(),
    ingredientName: z.string().min(1),
    reason: z.literal('negligible_seasoning'),
  })
  .strict();

export const recipeNutritionProvenanceSchema = z.discriminatedUnion('source', [
  z
    .object({
      confidence: z.literal('confirmed'),
      source: z.enum(['manual', 'schema_org']),
    })
    .strict(),
  z
    .object({
      confidence: z.enum(['high', 'medium', 'low']),
      datasetVersion: z.literal('2021'),
      matches: z.array(
        z
          .object({
            canonicalName: z.string().min(1),
            cofidCode: z.string().min(1),
            cofidName: z.string().min(1),
            grams: z.number().positive(),
            ingredientIndex: z.number().int().nonnegative(),
            matchConfidence: z.enum(['high', 'medium', 'low']),
            quantitySource: estimatedQuantitySourceSchema.exclude([
              'label_measure',
            ]),
          })
          .strict(),
      ),
      omissions: z.array(nutritionOmissionSchema).optional(),
      source: z.literal('cofid'),
    })
    .strict(),
  z
    .object({
      confidence: z.enum(['high', 'medium', 'low']),
      matches: z.array(
        z
          .object({
            canonicalName: z.string().min(1),
            foodCode: z.string().min(1),
            foodName: z.string().min(1),
            foodSource: z.enum(['cofid', 'label']),
            foodVersion: z.string().min(1),
            grams: z.number().positive(),
            ingredientIndex: z.number().int().nonnegative(),
            matchConfidence: z.enum(['high', 'medium', 'low']),
            quantitySource: estimatedQuantitySourceSchema,
          })
          .strict(),
      ),
      omissions: z.array(nutritionOmissionSchema).optional(),
      source: z.literal('nutrition_database'),
    })
    .strict(),
]);

const webUrlSchema = z
  .string()
  .url()
  .refine((value) => ['http:', 'https:'].includes(new URL(value).protocol));

export const recipeSourceSchema = z
  .object({
    name: z.string().trim(),
    url: webUrlSchema.nullable(),
  })
  .strict()
  .refine(({ name, url }) => name !== '' || url !== null);

export const recipeIngredientSchema = z
  .object({
    name: z.string().trim().min(1),
    preparationNote: z.string().trim(),
    quantity: z.number().positive(),
    unit: z.string().trim().min(1),
  })
  .strict();

const recipeTagsSchema = z
  .object({
    cuisines: z
      .array(z.string().trim().min(1))
      .refine((values) => new Set(values).size === values.length),
    flavours: z
      .array(z.string().trim().min(1))
      .refine((values) => new Set(values).size === values.length),
    proteins: z
      .array(z.string().trim().min(1))
      .refine((values) => new Set(values).size === values.length),
  })
  .strict();

export const recipeInputSchema = z
  .object({
    description: z.string().trim(),
    ingredients: z.array(recipeIngredientSchema).min(1),
    instructions: z.array(z.string().trim().min(1)),
    mealTypes: z
      .array(mealTypeSchema)
      .min(1)
      .refine((values) => new Set(values).size === values.length),
    nutrition: recipeNutritionSchema.nullable(),
    servingCount: z.number().positive(),
    source: recipeSourceSchema.nullable(),
    tags: recipeTagsSchema,
    title: z.string().trim().min(1),
  })
  .strict();

export const maxRecipeImportCharacters = 512 * 1024;

export const recipeImportWarningSchema = z
  .object({
    code: z.enum([
      'HOUSEHOLD_SUBSTITUTION_APPLIED',
      'INGREDIENT_REVIEW_NEEDED',
      'INVALID_NUTRITION',
      'INVALID_PHOTO',
      'MISSING_INGREDIENTS',
      'MISSING_MEAL_TYPE',
      'MISSING_TITLE',
      'MISSING_YIELD',
      'NUTRITION_ESTIMATED',
      'NUTRITION_ESTIMATION_INCOMPLETE',
      'NUTRITION_MATCH_REVIEW_NEEDED',
      'PHOTO_NOT_COPIED',
    ]),
    message: z.string().min(1),
  })
  .strict();

export const recipeImportIngredientDraftSchema = z
  .object({
    name: z.string().trim(),
    preparationNote: z.string().trim(),
    quantity: z.number().positive().nullable(),
    unit: z.string().trim(),
  })
  .strict();

export const recipeImportDraftSchema = z
  .object({
    description: z.string().trim(),
    ingredients: z.array(recipeImportIngredientDraftSchema),
    instructions: z.array(z.string().trim().min(1)),
    mealTypes: z
      .array(mealTypeSchema)
      .refine((values) => new Set(values).size === values.length),
    nutrition: recipeNutritionSchema.nullable(),
    nutritionProvenance: recipeNutritionProvenanceSchema
      .nullable()
      .default(null),
    photoStaged: z.boolean().default(false),
    photoUrl: webUrlSchema.nullable(),
    servingCount: z.number().positive().nullable(),
    source: recipeSourceSchema.nullable(),
    tags: recipeTagsSchema,
    title: z.string().trim(),
  })
  .strict();

export const recipeImportPreviewRequestSchema = z.union([
  z
    .object({
      content: z.string().min(1).max(maxRecipeImportCharacters),
      recipeIndex: z.number().int().nonnegative().optional(),
    })
    .strict(),
  z
    .object({
      recipeIndex: z.number().int().nonnegative().optional(),
      url: webUrlSchema,
    })
    .strict(),
]);

export const recipeImportSelectionResponseSchema = z
  .object({
    candidates: z.array(
      z
        .object({
          index: z.number().int().nonnegative(),
          title: z.string().min(1),
        })
        .strict(),
    ),
    kind: z.literal('selection'),
  })
  .strict();

export const recipeImportPreviewResponseSchema = z
  .object({
    draft: recipeImportDraftSchema,
    importId: opaqueIdSchema,
    kind: z.literal('preview'),
    warnings: z.array(recipeImportWarningSchema),
  })
  .strict();

export const recipeImportResponseSchema = z.discriminatedUnion('kind', [
  recipeImportSelectionResponseSchema,
  recipeImportPreviewResponseSchema,
]);

export const recipeImportSaveRequestSchema = z
  .object({
    recipe: recipeInputSchema,
  })
  .strict();

export const recipeSchema = recipeInputSchema
  .extend({
    id: opaqueIdSchema,
    nutritionProvenance: recipeNutritionProvenanceSchema.nullable(),
    photoUrl: z.string().url().nullable(),
    planningStatus: z.enum(['ready', 'needs-nutrition']),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const recipeSummarySchema = recipeSchema.pick({
  id: true,
  mealTypes: true,
  nutrition: true,
  nutritionProvenance: true,
  photoUrl: true,
  planningStatus: true,
  servingCount: true,
  title: true,
  updatedAt: true,
});

export const recipeListResponseSchema = z
  .object({
    items: z.array(recipeSummarySchema),
    nextCursor: z.string().min(1).nullable(),
  })
  .strict();

export type ApiError = z.infer<typeof apiErrorSchema>;
export type CognitoRuntimeConfig = z.infer<typeof cognitoRuntimeConfigSchema>;
export type HouseholdSettings = z.infer<typeof householdSettingsSchema>;
export type MacroTargets = z.infer<typeof macroTargetsSchema>;
export type MealType = z.infer<typeof mealTypeSchema>;
export type PersonSummary = z.infer<typeof personSummarySchema>;
export type Recipe = z.infer<typeof recipeSchema>;
export type RecipeImportDraft = z.infer<typeof recipeImportDraftSchema>;
export type RecipeImportPreview = z.infer<
  typeof recipeImportPreviewResponseSchema
>;
export type RecipeImportResponse = z.infer<typeof recipeImportResponseSchema>;
export type RecipeImportWarning = z.infer<typeof recipeImportWarningSchema>;
export type RecipeIngredient = z.infer<typeof recipeIngredientSchema>;
export type RecipeInput = z.infer<typeof recipeInputSchema>;
export type RecipeListResponse = z.infer<typeof recipeListResponseSchema>;
export type RecipeNutrition = z.infer<typeof recipeNutritionSchema>;
export type RecipeNutritionProvenance = z.infer<
  typeof recipeNutritionProvenanceSchema
>;
export type RecipePhotoContentType = z.infer<
  typeof recipePhotoContentTypeSchema
>;
export type RecipePhotoUploadRequest = z.infer<
  typeof recipePhotoUploadRequestSchema
>;
export type RecipePhotoUploadResponse = z.infer<
  typeof recipePhotoUploadResponseSchema
>;
export type RecipeSummary = z.infer<typeof recipeSummarySchema>;
export type RecipeSource = z.infer<typeof recipeSourceSchema>;
export type RuntimeConfig = z.infer<typeof runtimeConfigSchema>;
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
