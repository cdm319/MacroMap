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

export type ApiError = z.infer<typeof apiErrorSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
