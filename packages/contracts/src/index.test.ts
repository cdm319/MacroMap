import { describe, expect, it } from 'vitest';
import { apiErrorSchema, healthResponseSchema } from './index.js';

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

  it('rejects structurally invalid health responses', () => {
    expect(() =>
      healthResponseSchema.parse({
        service: 'other-api',
        status: 'ok',
        time: 'not-a-date',
      }),
    ).toThrow();
  });
});
