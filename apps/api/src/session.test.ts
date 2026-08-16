import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { describe, expect, it, vi } from 'vitest';
import type { SessionRepository } from '../../../packages/database/src/data-api.js';
import { createSessionHandler } from './session.js';

const session = {
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
} as const;

function event(subject?: string): APIGatewayProxyEventV2WithJWTAuthorizer {
  return {
    requestContext: {
      authorizer: {
        jwt: {
          claims: subject === undefined ? {} : { sub: subject },
          scopes: [],
        },
      },
      requestId: 'request-123',
    },
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

describe('authenticated session handler', () => {
  it('loads the household from the validated Cognito subject', async () => {
    const findBySubject = vi.fn().mockResolvedValue(session);
    const response = await createSessionHandler({ findBySubject })(
      event('subject-1'),
    );

    expect(findBySubject).toHaveBeenCalledWith('subject-1');
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body ?? '{}')).toEqual(session);
  });

  it('does not query without a validated subject', async () => {
    const repository: SessionRepository = { findBySubject: vi.fn() };
    const response = await createSessionHandler(repository)(event());

    expect(repository.findBySubject).not.toHaveBeenCalled();
    expect(response.statusCode).toBe(401);
  });

  it('rejects an identity that has not been bootstrapped', async () => {
    const response = await createSessionHandler({
      findBySubject: vi.fn().mockResolvedValue(undefined),
    })(event('unknown-subject'));

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body ?? '{}')).toMatchObject({
      error: { code: 'ACCOUNT_NOT_BOOTSTRAPPED' },
    });
  });

  it('returns a retryable waking response for database failures', async () => {
    const response = await createSessionHandler({
      findBySubject: vi.fn().mockRejectedValue(new Error('database paused')),
    })(event('subject-1'));

    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response.body ?? '{}')).toMatchObject({
      error: { code: 'DATABASE_WAKING' },
    });
  });

  it('does not expose invalid persisted session data', async () => {
    const response = await createSessionHandler({
      findBySubject: vi.fn().mockResolvedValue({
        household: { displayName: '', id: 'not-a-uuid' },
        people: [],
      }),
    })(event('subject-1'));

    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body ?? '{}')).toMatchObject({
      error: { code: 'INTERNAL_ERROR' },
    });
  });
});
