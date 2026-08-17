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

export type ApiError = z.infer<typeof apiErrorSchema>;
export type CognitoRuntimeConfig = z.infer<typeof cognitoRuntimeConfigSchema>;
export type HouseholdSettings = z.infer<typeof householdSettingsSchema>;
export type MacroTargets = z.infer<typeof macroTargetsSchema>;
export type PersonSummary = z.infer<typeof personSummarySchema>;
export type RuntimeConfig = z.infer<typeof runtimeConfigSchema>;
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
