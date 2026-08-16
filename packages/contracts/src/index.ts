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

export const healthResponseSchema = z
  .object({
    service: z.literal('macromap-api'),
    status: z.literal('ok'),
    time: z.string().datetime({ offset: true }),
  })
  .strict();

export const personSummarySchema = z
  .object({
    displayName: z.string().min(1),
    id: opaqueIdSchema,
    slug: z.string().regex(/^[a-z][a-z0-9-]*$/u),
  })
  .strict();

export const sessionResponseSchema = z
  .object({
    household: z
      .object({
        displayName: z.string().min(1),
        id: opaqueIdSchema,
      })
      .strict(),
    people: z.array(personSummarySchema).min(1),
  })
  .strict();

export type ApiError = z.infer<typeof apiErrorSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type PersonSummary = z.infer<typeof personSummarySchema>;
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
