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
    tags: recipeTagsSchema,
    title: z.string().trim().min(1),
  })
  .strict();

export const recipeSchema = recipeInputSchema
  .extend({
    id: opaqueIdSchema,
    photoUrl: z.string().url().nullable(),
    planningStatus: z.enum(['ready', 'needs-nutrition']),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const recipeSummarySchema = recipeSchema.pick({
  id: true,
  mealTypes: true,
  nutrition: true,
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
export type RecipeIngredient = z.infer<typeof recipeIngredientSchema>;
export type RecipeInput = z.infer<typeof recipeInputSchema>;
export type RecipeListResponse = z.infer<typeof recipeListResponseSchema>;
export type RecipeNutrition = z.infer<typeof recipeNutritionSchema>;
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
export type RuntimeConfig = z.infer<typeof runtimeConfigSchema>;
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
