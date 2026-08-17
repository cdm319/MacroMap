import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';
import {
  opaqueIdSchema,
  recipeInputSchema,
  recipeListResponseSchema,
  recipeSchema,
} from '@macromap/contracts';
import {
  RecipeNotFoundError,
  type RecipePageCursor,
  type RecipeRepository,
} from '@macromap/database';
import { errorResponse, jsonResponse } from './http.js';

export async function handleRecipeRequest(
  repository: RecipeRepository,
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
  subject: string,
  requestId: string,
): Promise<APIGatewayProxyStructuredResultV2> {
  if (event.routeKey === 'GET /v1/recipes') {
    return listRecipes(repository, event, subject, requestId);
  }

  const recipeId = opaqueIdSchema.safeParse(event.pathParameters?.recipeId);
  if (!recipeId.success) {
    return errorResponse(
      400,
      'VALIDATION_FAILED',
      'The recipe id is invalid.',
      requestId,
    );
  }

  if (event.routeKey === 'GET /v1/recipes/{recipeId}') {
    return findRecipe(repository, subject, recipeId.data, requestId);
  }
  if (event.routeKey === 'PUT /v1/recipes/{recipeId}') {
    return saveRecipe(repository, event, subject, recipeId.data, requestId);
  }
  if (event.routeKey === 'DELETE /v1/recipes/{recipeId}') {
    return archiveRecipe(repository, subject, recipeId.data, requestId);
  }

  return errorResponse(404, 'NOT_FOUND', 'Endpoint not found.', requestId);
}

async function listRecipes(
  repository: RecipeRepository,
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
  subject: string,
  requestId: string,
): Promise<APIGatewayProxyStructuredResultV2> {
  let cursor: RecipePageCursor | undefined;
  try {
    cursor = decodeCursor(event.queryStringParameters?.cursor);
  } catch {
    return errorResponse(
      400,
      'INVALID_CURSOR',
      'The recipe page cursor is invalid.',
      requestId,
    );
  }

  try {
    const page = await repository.list(subject, cursor);
    if (page === undefined) return accountNotBootstrapped(requestId);
    const response = recipeListResponseSchema.safeParse({
      items: page.items,
      nextCursor:
        page.nextCursor === null ? null : encodeCursor(page.nextCursor),
    });
    if (response.success) return jsonResponse(200, response.data);
  } catch (error) {
    return databaseError(error, 'recipe_list_failed', requestId);
  }

  console.error(JSON.stringify({ event: 'invalid_recipe_list', requestId }));
  return internalError(requestId);
}

async function findRecipe(
  repository: RecipeRepository,
  subject: string,
  recipeId: string,
  requestId: string,
): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const recipe = await repository.find(subject, recipeId);
    if (recipe === undefined) return recipeNotFound(requestId);
    const response = recipeSchema.safeParse(recipe);
    if (response.success) return jsonResponse(200, response.data);
  } catch (error) {
    return databaseError(error, 'recipe_load_failed', requestId);
  }

  console.error(
    JSON.stringify({ event: 'invalid_recipe_data', recipeId, requestId }),
  );
  return internalError(requestId);
}

async function saveRecipe(
  repository: RecipeRepository,
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
  subject: string,
  recipeId: string,
  requestId: string,
): Promise<APIGatewayProxyStructuredResultV2> {
  let body: unknown;
  try {
    body = JSON.parse(event.body ?? '');
  } catch {
    return invalidRecipe(requestId);
  }
  const input = recipeInputSchema.safeParse(body);
  if (!input.success) return invalidRecipe(requestId);

  try {
    const recipe = await repository.save(subject, recipeId, input.data);
    if (recipe === undefined) return accountNotBootstrapped(requestId);
    const response = recipeSchema.safeParse(recipe);
    if (response.success) return jsonResponse(200, response.data);
  } catch (error) {
    if (error instanceof RecipeNotFoundError) return recipeNotFound(requestId);
    return databaseError(error, 'recipe_save_failed', requestId);
  }

  console.error(
    JSON.stringify({ event: 'invalid_saved_recipe', recipeId, requestId }),
  );
  return internalError(requestId);
}

async function archiveRecipe(
  repository: RecipeRepository,
  subject: string,
  recipeId: string,
  requestId: string,
): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const archived = await repository.archive(subject, recipeId);
    return archived ? { statusCode: 204 } : recipeNotFound(requestId);
  } catch (error) {
    return databaseError(error, 'recipe_archive_failed', requestId);
  }
}

function decodeCursor(value: string | undefined): RecipePageCursor | undefined {
  if (value === undefined) return undefined;
  const parsed = JSON.parse(
    Buffer.from(value, 'base64url').toString('utf8'),
  ) as {
    id?: unknown;
    updatedAt?: unknown;
  };
  const id = opaqueIdSchema.parse(parsed.id);
  if (typeof parsed.updatedAt !== 'string') throw new Error('Invalid date');
  const updatedAt = new Date(parsed.updatedAt);
  if (Number.isNaN(updatedAt.valueOf())) throw new Error('Invalid date');
  return { id, updatedAt };
}

function encodeCursor(cursor: RecipePageCursor): string {
  return Buffer.from(
    JSON.stringify({
      id: cursor.id,
      updatedAt: cursor.updatedAt.toISOString(),
    }),
  ).toString('base64url');
}

function invalidRecipe(requestId: string): APIGatewayProxyStructuredResultV2 {
  return errorResponse(
    400,
    'VALIDATION_FAILED',
    'Enter a complete recipe with usable servings, ingredients, and instructions.',
    requestId,
  );
}

function recipeNotFound(requestId: string): APIGatewayProxyStructuredResultV2 {
  return errorResponse(404, 'RECIPE_NOT_FOUND', 'Recipe not found.', requestId);
}

function accountNotBootstrapped(
  requestId: string,
): APIGatewayProxyStructuredResultV2 {
  return errorResponse(
    403,
    'ACCOUNT_NOT_BOOTSTRAPPED',
    'This account has not been connected to MacroMap yet.',
    requestId,
  );
}

function internalError(requestId: string): APIGatewayProxyStructuredResultV2 {
  return errorResponse(
    500,
    'INTERNAL_ERROR',
    'MacroMap could not read that recipe.',
    requestId,
  );
}

function databaseError(
  error: unknown,
  event: string,
  requestId: string,
): APIGatewayProxyStructuredResultV2 {
  console.error(
    JSON.stringify({
      errorName: error instanceof Error ? error.name : 'UnknownError',
      event,
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
