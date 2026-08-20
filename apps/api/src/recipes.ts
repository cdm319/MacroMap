import { randomUUID } from 'node:crypto';
import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';
import {
  opaqueIdSchema,
  recipeInputSchema,
  recipeListResponseSchema,
  recipePhotoResponseSchema,
  recipePhotoUploadRequestSchema,
  recipePhotoUploadResponseSchema,
  recipeSchema,
} from '@macromap/contracts';
import {
  RecipeNotFoundError,
  type RecipePageCursor,
  type RecipeRepository,
  type StoredRecipe,
  type StoredRecipeSummary,
} from '@macromap/database';
import { databaseErrorResponse, errorResponse, jsonResponse } from './http.js';
import { prepareRecipeNutrition } from './nutrition.js';
import {
  InvalidRecipePhotoError,
  type RecipePhotoStore,
} from './recipe-photo-store.js';

export async function handleRecipeRequest(
  repository: RecipeRepository,
  photos: RecipePhotoStore,
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
  subject: string,
  requestId: string,
): Promise<APIGatewayProxyStructuredResultV2> {
  if (event.routeKey === 'GET /v1/recipes') {
    return listRecipes(repository, photos, event, subject, requestId);
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
    return findRecipe(repository, photos, subject, recipeId.data, requestId);
  }
  if (event.routeKey === 'PUT /v1/recipes/{recipeId}') {
    return saveRecipe(
      repository,
      photos,
      event,
      subject,
      recipeId.data,
      requestId,
    );
  }
  if (event.routeKey === 'DELETE /v1/recipes/{recipeId}') {
    return archiveRecipe(repository, subject, recipeId.data, requestId);
  }
  if (event.routeKey === 'POST /v1/recipes/{recipeId}/photos') {
    return createPhotoUpload(
      repository,
      photos,
      event,
      subject,
      recipeId.data,
      requestId,
    );
  }
  if (event.routeKey === 'PUT /v1/recipes/{recipeId}/photos/{uploadId}') {
    return completePhotoUpload(
      repository,
      photos,
      event,
      subject,
      recipeId.data,
      requestId,
    );
  }
  if (event.routeKey === 'DELETE /v1/recipes/{recipeId}/photos') {
    return deletePhoto(repository, photos, subject, recipeId.data, requestId);
  }

  return errorResponse(404, 'NOT_FOUND', 'Endpoint not found.', requestId);
}

async function listRecipes(
  repository: RecipeRepository,
  photos: RecipePhotoStore,
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
      items: await Promise.all(
        page.items.map((recipe) => presentSummary(recipe, photos)),
      ),
      nextCursor:
        page.nextCursor === null ? null : encodeCursor(page.nextCursor),
    });
    if (response.success) return jsonResponse(200, response.data);
  } catch (error) {
    return databaseErrorResponse(
      error,
      'recipe_list_failed',
      requestId,
      'MacroMap could not load your recipes.',
    );
  }

  console.error(JSON.stringify({ event: 'invalid_recipe_list', requestId }));
  return internalError(requestId);
}

async function findRecipe(
  repository: RecipeRepository,
  photos: RecipePhotoStore,
  subject: string,
  recipeId: string,
  requestId: string,
): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const recipe = await repository.find(subject, recipeId);
    if (recipe === undefined) return recipeNotFound(requestId);
    const response = recipeSchema.safeParse(
      await presentRecipe(recipe, photos),
    );
    if (response.success) return jsonResponse(200, response.data);
  } catch (error) {
    return databaseErrorResponse(
      error,
      'recipe_load_failed',
      requestId,
      'MacroMap could not load that recipe.',
    );
  }

  console.error(
    JSON.stringify({ event: 'invalid_recipe_data', recipeId, requestId }),
  );
  return internalError(requestId);
}

async function saveRecipe(
  repository: RecipeRepository,
  photos: RecipePhotoStore,
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
  const prepared = prepareRecipeNutrition(input.data);

  try {
    const recipe = await repository.save(
      subject,
      recipeId,
      prepared.recipe,
      prepared.nutritionProvenance,
    );
    if (recipe === undefined) return accountNotBootstrapped(requestId);
    const response = recipeSchema.safeParse(
      await presentRecipe(recipe, photos),
    );
    if (response.success) return jsonResponse(200, response.data);
  } catch (error) {
    if (error instanceof RecipeNotFoundError) return recipeNotFound(requestId);
    return databaseErrorResponse(
      error,
      'recipe_save_failed',
      requestId,
      'MacroMap could not save that recipe.',
    );
  }

  console.error(
    JSON.stringify({ event: 'invalid_saved_recipe', recipeId, requestId }),
  );
  return internalError(requestId);
}

async function createPhotoUpload(
  repository: RecipeRepository,
  photos: RecipePhotoStore,
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
  subject: string,
  recipeId: string,
  requestId: string,
): Promise<APIGatewayProxyStructuredResultV2> {
  const input = recipePhotoUploadRequestSchema.safeParse(readJson(event));
  if (!input.success) return invalidPhoto(requestId);

  try {
    if ((await repository.find(subject, recipeId)) === undefined) {
      return recipeNotFound(requestId);
    }
    const uploadId = randomUUID();
    const response = recipePhotoUploadResponseSchema.parse({
      uploadId,
      uploadUrl: await photos.createUpload(
        recipeId,
        uploadId,
        input.data.contentType,
      ),
    });
    return jsonResponse(201, response);
  } catch (error) {
    return photoStorageError(
      error,
      'recipe_photo_upload_create_failed',
      requestId,
    );
  }
}

async function completePhotoUpload(
  repository: RecipeRepository,
  photos: RecipePhotoStore,
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
  subject: string,
  recipeId: string,
  requestId: string,
): Promise<APIGatewayProxyStructuredResultV2> {
  const uploadId = opaqueIdSchema.safeParse(event.pathParameters?.uploadId);
  if (!uploadId.success) return invalidPhoto(requestId);

  try {
    if ((await repository.find(subject, recipeId)) === undefined) {
      return recipeNotFound(requestId);
    }
    await photos.completeUpload(recipeId, uploadId.data);
    if (!(await repository.setPhoto(subject, recipeId, new Date()))) {
      return recipeNotFound(requestId);
    }
    return jsonResponse(
      200,
      recipePhotoResponseSchema.parse({
        photoUrl: await photos.viewUrl(recipeId),
      }),
    );
  } catch (error) {
    return photoStorageError(
      error,
      'recipe_photo_upload_complete_failed',
      requestId,
    );
  }
}

async function deletePhoto(
  repository: RecipeRepository,
  photos: RecipePhotoStore,
  subject: string,
  recipeId: string,
  requestId: string,
): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    if ((await repository.find(subject, recipeId)) === undefined) {
      return recipeNotFound(requestId);
    }
    await photos.delete(recipeId);
    if (!(await repository.setPhoto(subject, recipeId, null))) {
      return recipeNotFound(requestId);
    }
    return { statusCode: 204 };
  } catch (error) {
    return photoStorageError(error, 'recipe_photo_delete_failed', requestId);
  }
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
    return databaseErrorResponse(
      error,
      'recipe_archive_failed',
      requestId,
      'MacroMap could not archive that recipe.',
    );
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

async function presentRecipe(recipe: StoredRecipe, photos: RecipePhotoStore) {
  const { photoUpdatedAt, ...stored } = recipe;
  return {
    ...stored,
    photoUrl: photoUpdatedAt === null ? null : await photos.viewUrl(recipe.id),
  };
}

async function presentSummary(
  recipe: StoredRecipeSummary,
  photos: RecipePhotoStore,
) {
  const { photoUpdatedAt, ...stored } = recipe;
  return {
    ...stored,
    photoUrl: photoUpdatedAt === null ? null : await photos.viewUrl(recipe.id),
  };
}

function readJson(event: APIGatewayProxyEventV2WithJWTAuthorizer): unknown {
  try {
    return JSON.parse(event.body ?? '');
  } catch {
    return undefined;
  }
}

function invalidRecipe(requestId: string): APIGatewayProxyStructuredResultV2 {
  return errorResponse(
    400,
    'VALIDATION_FAILED',
    'Enter a recipe with a title, usable servings, and complete ingredients.',
    requestId,
  );
}

function invalidPhoto(requestId: string): APIGatewayProxyStructuredResultV2 {
  return errorResponse(
    400,
    'INVALID_RECIPE_PHOTO',
    'Choose a JPEG, PNG, or WebP image no larger than 5 MB.',
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

function photoStorageError(
  error: unknown,
  event: string,
  requestId: string,
): APIGatewayProxyStructuredResultV2 {
  if (error instanceof InvalidRecipePhotoError) {
    return errorResponse(422, 'INVALID_RECIPE_PHOTO', error.message, requestId);
  }
  console.error(
    JSON.stringify({
      errorName: error instanceof Error ? error.name : 'UnknownError',
      event,
      requestId,
    }),
  );
  return errorResponse(
    503,
    'PHOTO_STORAGE_UNAVAILABLE',
    'Recipe photo storage is temporarily unavailable. Please try again.',
    requestId,
  );
}
