import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';
import {
  householdSettingsSchema,
  sessionResponseSchema,
} from '@macromap/contracts';
import {
  createDataApiHouseholdRepository,
  createDataApiRecipeImportRepository,
  createDataApiWeeklyPlanRepository,
  HouseholdPeopleMismatchError,
  type HouseholdRepository,
  type HouseholdSession,
  type RecipeImportRepository,
  type WeeklyPlanRepository,
} from '@macromap/database';
import {
  createDataApiRecipeRepository,
  type RecipeRepository,
} from '@macromap/database';
import { databaseErrorResponse, errorResponse, jsonResponse } from './http.js';
import {
  createS3RecipePhotoStore,
  type RecipePhotoStore,
} from './recipe-photo-store.js';
import {
  createRecipeSourceFetcher,
  type RecipeSourceFetcher,
} from './recipe-source-fetcher.js';
import { handleRecipeRequest } from './recipes.js';
import { handleRecipeImportRequest } from './recipe-imports.js';
import { handleWeeklyPlanRequest } from './weekly-plans.js';

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
    return databaseErrorResponse(
      error,
      'session_load_failed',
      requestId,
      'MacroMap could not load your household.',
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
    return databaseErrorResponse(
      error,
      'settings_update_failed',
      requestId,
      'MacroMap could not save your settings.',
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

export interface ApplicationDependencies {
  readonly households: HouseholdRepository;
  readonly imports: RecipeImportRepository;
  readonly photos: RecipePhotoStore;
  readonly plans: WeeklyPlanRepository;
  readonly recipes: RecipeRepository;
  readonly sources: RecipeSourceFetcher;
}

let dependencies: ApplicationDependencies | undefined;

function getDependencies(): ApplicationDependencies {
  const config = {
    databaseName: requireEnvironment('DATABASE_NAME'),
    resourceArn: requireEnvironment('DATABASE_RESOURCE_ARN'),
    secretArn: requireEnvironment('DATABASE_SECRET_ARN'),
  };
  dependencies ??= {
    households: createDataApiHouseholdRepository(config),
    imports: createDataApiRecipeImportRepository(config),
    photos: createS3RecipePhotoStore(
      requireEnvironment('RECIPE_PHOTO_BUCKET_NAME'),
    ),
    plans: createDataApiWeeklyPlanRepository(config),
    recipes: createDataApiRecipeRepository(config),
    sources: createRecipeSourceFetcher(),
  };
  return dependencies;
}

export async function handleRequest(
  dependencies: ApplicationDependencies,
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
    return loadSession(dependencies.households, subject, requestId);
  }
  if (event.routeKey === 'PUT /v1/household-settings') {
    return updateSettings(dependencies.households, event, subject, requestId);
  }
  if (event.routeKey.includes('/v1/recipe-imports')) {
    return handleRecipeImportRequest(
      dependencies.imports,
      dependencies.recipes,
      dependencies.photos,
      dependencies.sources,
      event,
      subject,
      requestId,
    );
  }
  if (event.routeKey.includes('/v1/recipes')) {
    return handleRecipeRequest(
      dependencies.recipes,
      dependencies.photos,
      event,
      subject,
      requestId,
    );
  }
  if (event.routeKey.includes('/v1/weekly-plans')) {
    return handleWeeklyPlanRequest(
      dependencies.plans,
      event,
      subject,
      requestId,
    );
  }
  return errorResponse(404, 'NOT_FOUND', 'Endpoint not found.', requestId);
}

export async function handler(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyStructuredResultV2> {
  return handleRequest(getDependencies(), event);
}
