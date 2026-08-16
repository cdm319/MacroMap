import { describe, expect, it } from 'vitest';
import {
  apiErrorSchema,
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
        },
        people: [
          {
            displayName: 'Chris',
            id: '00000000-0000-4000-8000-000000000101',
            slug: 'chris',
          },
          {
            displayName: 'Alex',
            id: '00000000-0000-4000-8000-000000000102',
            slug: 'alex',
          },
        ],
      }),
    ).toMatchObject({
      people: [{ slug: 'chris' }, { slug: 'alex' }],
    });
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
});
