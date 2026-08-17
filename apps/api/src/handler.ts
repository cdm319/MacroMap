import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';
import {
  householdSettingsSchema,
  sessionResponseSchema,
  type ApiError,
} from '@macromap/contracts';
import {
  createDataApiHouseholdRepository,
  HouseholdPeopleMismatchError,
  type HouseholdRepository,
  type HouseholdSession,
} from '@macromap/database';

function jsonResponse(
  statusCode: number,
  body: unknown,
): APIGatewayProxyStructuredResultV2 {
  return {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    statusCode,
  };
}

function errorResponse(
  statusCode: number,
  code: string,
  message: string,
  requestId: string,
): APIGatewayProxyStructuredResultV2 {
  return jsonResponse(statusCode, {
    error: { code, message, requestId },
  } satisfies ApiError);
}

function sessionResponse(
  session: HouseholdSession,
  requestId: string,
): APIGatewayProxyStructuredResultV2 {
  const validated = sessionResponseSchema.safeParse(session);
  if (validated.success) return jsonResponse(200, validated.data);

  console.error(JSON.stringify({ event: 'invalid_session_data', requestId }));
  return errorResponse(
    500,
    'INTERNAL_ERROR',
    'MacroMap could not load your household.',
    requestId,
  );
}

async function loadSession(
  repository: HouseholdRepository,
  subject: string,
  requestId: string,
): Promise<APIGatewayProxyStructuredResultV2> {
  let session;
  try {
    session = await repository.findBySubject(subject);
  } catch (error) {
    console.error(
      JSON.stringify({
        errorName: error instanceof Error ? error.name : 'UnknownError',
        event: 'session_load_failed',
        requestId,
      }),
    );
    return errorResponse(
      503,
      'DATABASE_WAKING',
      'MacroMap is waking its database. Please try again shortly.',
      requestId,
    );
  }

  return session === undefined
    ? errorResponse(
        403,
        'ACCOUNT_NOT_BOOTSTRAPPED',
        'This account has not been connected to MacroMap yet.',
        requestId,
      )
    : sessionResponse(session, requestId);
}

async function updateSettings(
  repository: HouseholdRepository,
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
  subject: string,
  requestId: string,
): Promise<APIGatewayProxyStructuredResultV2> {
  let body: unknown;
  try {
    body = JSON.parse(event.body ?? '');
  } catch {
    return errorResponse(
      400,
      'VALIDATION_FAILED',
      'Enter complete macro targets and a valid snack reserve.',
      requestId,
    );
  }

  const settings = householdSettingsSchema.safeParse(body);
  if (!settings.success) {
    return errorResponse(
      400,
      'VALIDATION_FAILED',
      'Enter complete macro targets and a valid snack reserve.',
      requestId,
    );
  }

  let session;
  try {
    session = await repository.updateSettings(subject, settings.data);
  } catch (error) {
    if (error instanceof HouseholdPeopleMismatchError) {
      return errorResponse(400, 'HOUSEHOLD_CHANGED', error.message, requestId);
    }
    console.error(
      JSON.stringify({
        errorName: error instanceof Error ? error.name : 'UnknownError',
        event: 'settings_update_failed',
        requestId,
      }),
    );
    return errorResponse(
      503,
      'DATABASE_WAKING',
      'MacroMap is waking its database. Please try again shortly.',
      requestId,
    );
  }

  return session === undefined
    ? errorResponse(
        403,
        'ACCOUNT_NOT_BOOTSTRAPPED',
        'This account has not been connected to MacroMap yet.',
        requestId,
      )
    : sessionResponse(session, requestId);
}

function requireEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(`${name} is required.`);
  }
  return value;
}

let repository: HouseholdRepository | undefined;

function getRepository(): HouseholdRepository {
  repository ??= createDataApiHouseholdRepository({
    databaseName: requireEnvironment('DATABASE_NAME'),
    resourceArn: requireEnvironment('DATABASE_RESOURCE_ARN'),
    secretArn: requireEnvironment('DATABASE_SECRET_ARN'),
  });
  return repository;
}

export async function handleRequest(
  repository: HouseholdRepository,
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyStructuredResultV2> {
  const requestId = event.requestContext.requestId;
  const subject = event.requestContext.authorizer.jwt.claims.sub;
  if (typeof subject !== 'string' || subject.trim() === '') {
    return errorResponse(
      401,
      'AUTHENTICATION_REQUIRED',
      'Sign in is required.',
      requestId,
    );
  }

  if (event.routeKey === 'GET /v1/session') {
    return loadSession(repository, subject, requestId);
  }
  if (event.routeKey === 'PUT /v1/household-settings') {
    return updateSettings(repository, event, subject, requestId);
  }
  return errorResponse(404, 'NOT_FOUND', 'Endpoint not found.', requestId);
}

export async function handler(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyStructuredResultV2> {
  return handleRequest(getRepository(), event);
}
