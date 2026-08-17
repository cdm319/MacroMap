import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import {
  HouseholdPeopleMismatchError,
  type HouseholdRepository,
} from '@macromap/database';
import { describe, expect, it, vi } from 'vitest';
import { handleRequest } from './handler.js';

const session = {
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
} as const;

function createRepository(
  overrides: Partial<HouseholdRepository> = {},
): HouseholdRepository {
  return {
    findBySubject: vi.fn().mockResolvedValue(session),
    updateSettings: vi.fn().mockResolvedValue(session),
    ...overrides,
  };
}

function event(
  routeKey: string,
  options: { body?: unknown; subject?: string } = {},
): APIGatewayProxyEventV2WithJWTAuthorizer {
  return {
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    requestContext: {
      authorizer: {
        jwt: {
          claims: options.subject === undefined ? {} : { sub: options.subject },
          scopes: [],
        },
      },
      requestId: 'request-123',
    },
    routeKey,
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

describe('authenticated household API', () => {
  it('loads the household from the validated Cognito subject', async () => {
    const repository = createRepository();
    const response = await handleRequest(
      repository,
      event('GET /v1/session', { subject: 'subject-1' }),
    );

    expect(repository.findBySubject).toHaveBeenCalledWith('subject-1');
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body ?? '{}')).toEqual(session);
  });

  it('does not query without a validated subject', async () => {
    const repository = createRepository();
    const response = await handleRequest(repository, event('GET /v1/session'));

    expect(repository.findBySubject).not.toHaveBeenCalled();
    expect(repository.updateSettings).not.toHaveBeenCalled();
    expect(response.statusCode).toBe(401);
  });

  it('rejects an identity that has not been linked', async () => {
    const response = await handleRequest(
      createRepository({
        findBySubject: vi.fn().mockResolvedValue(undefined),
      }),
      event('GET /v1/session', { subject: 'unknown-subject' }),
    );

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body ?? '{}')).toMatchObject({
      error: { code: 'ACCOUNT_NOT_BOOTSTRAPPED' },
    });
  });

  it('returns a retryable waking response for database failures', async () => {
    const response = await handleRequest(
      createRepository({
        findBySubject: vi.fn().mockRejectedValue(new Error('database paused')),
      }),
      event('GET /v1/session', { subject: 'subject-1' }),
    );

    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response.body ?? '{}')).toMatchObject({
      error: { code: 'DATABASE_WAKING' },
    });
  });

  it('does not expose invalid persisted session data', async () => {
    const response = await handleRequest(
      createRepository({
        findBySubject: vi.fn().mockResolvedValue({
          household: { displayName: '', id: 'not-a-uuid' },
          people: [],
        }),
      }),
      event('GET /v1/session', { subject: 'subject-1' }),
    );

    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body ?? '{}')).toMatchObject({
      error: { code: 'INTERNAL_ERROR' },
    });
  });

  it('validates and saves the complete household settings', async () => {
    const repository = createRepository();
    const settings = {
      people: session.people.map(({ id }) => ({
        id,
        macroTargets: {
          carbsGrams: 250,
          fatGrams: 70,
          kcal: 2_200,
          proteinGrams: 160,
        },
      })),
      snackReserve: 0.15,
    };
    const response = await handleRequest(
      repository,
      event('PUT /v1/household-settings', {
        body: settings,
        subject: 'subject-1',
      }),
    );

    expect(repository.updateSettings).toHaveBeenCalledWith(
      'subject-1',
      settings,
    );
    expect(response.statusCode).toBe(200);
  });

  it('rejects incomplete settings and changed household profiles', async () => {
    const repository = createRepository({
      updateSettings: vi
        .fn()
        .mockRejectedValue(new HouseholdPeopleMismatchError()),
    });
    const invalidResponse = await handleRequest(
      repository,
      event('PUT /v1/household-settings', {
        body: { people: [], snackReserve: 0.15 },
        subject: 'subject-1',
      }),
    );
    const changedResponse = await handleRequest(
      repository,
      event('PUT /v1/household-settings', {
        body: {
          people: [
            {
              id: session.people[0]?.id,
              macroTargets: session.people[0]?.macroTargets,
            },
          ],
          snackReserve: 0.15,
        },
        subject: 'subject-1',
      }),
    );

    expect(invalidResponse.statusCode).toBe(400);
    expect(changedResponse.statusCode).toBe(400);
    expect(JSON.parse(changedResponse.body ?? '{}')).toMatchObject({
      error: { code: 'HOUSEHOLD_CHANGED' },
    });
  });
});
