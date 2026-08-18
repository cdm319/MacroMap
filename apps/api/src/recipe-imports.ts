import { randomUUID } from 'node:crypto';
import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';
import {
  opaqueIdSchema,
  recipeImportPreviewRequestSchema,
  recipeImportResponseSchema,
  recipeImportSaveRequestSchema,
  recipeSchema,
} from '@macromap/contracts';
import {
  RecipeNotFoundError,
  type RecipeImportRepository,
  type RecipeRepository,
  type StoredRecipe,
} from '@macromap/database';
import { parseSchemaOrgRecipe } from '@macromap/domain/schema-org-recipe';
import { errorResponse, jsonResponse } from './http.js';
import { prepareRecipeNutrition } from './nutrition.js';
import type { RecipePhotoStore } from './recipe-photo-store.js';

export async function handleRecipeImportRequest(
  imports: RecipeImportRepository,
  recipes: RecipeRepository,
  photos: RecipePhotoStore,
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
  subject: string,
  requestId: string,
): Promise<APIGatewayProxyStructuredResultV2> {
  if (event.routeKey === 'POST /v1/recipe-imports/preview') {
    return previewImport(imports, event, subject, requestId);
  }

  const importId = opaqueIdSchema.safeParse(event.pathParameters?.importId);
  if (!importId.success)
    return invalidImport('The import id is invalid.', requestId);
  if (event.routeKey === 'POST /v1/recipe-imports/{importId}/save') {
    return saveImport(
      imports,
      recipes,
      photos,
      event,
      subject,
      importId.data,
      requestId,
    );
  }
  return errorResponse(404, 'NOT_FOUND', 'Endpoint not found.', requestId);
}

async function previewImport(
  repository: RecipeImportRepository,
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
  subject: string,
  requestId: string,
): Promise<APIGatewayProxyStructuredResultV2> {
  const input = recipeImportPreviewRequestSchema.safeParse(readJson(event));
  if (!input.success) {
    return invalidImport(
      'Paste valid recipe JSON no larger than 512 KB.',
      requestId,
    );
  }

  const parsed = parseSchemaOrgRecipe(
    input.data.content,
    input.data.recipeIndex,
  );
  if (parsed.kind === 'error') {
    return errorResponse(
      parsed.code === 'INVALID_JSON' ? 400 : 422,
      parsed.code,
      parsed.message,
      requestId,
    );
  }
  if (parsed.kind === 'selection') {
    return jsonResponse(
      200,
      recipeImportResponseSchema.parse({
        ...parsed,
        candidates: parsed.candidates,
      }),
    );
  }

  const importId = randomUUID();
  try {
    const created = await repository.create(
      subject,
      importId,
      input.data.content,
      parsed.draft,
      parsed.warnings,
    );
    if (!created) return accountNotBootstrapped(requestId);
  } catch (error) {
    return databaseError(error, 'recipe_import_preview_failed', requestId);
  }

  return jsonResponse(
    201,
    recipeImportResponseSchema.parse({
      draft: parsed.draft,
      importId,
      kind: 'preview',
      warnings: parsed.warnings,
    }),
  );
}

async function saveImport(
  imports: RecipeImportRepository,
  recipes: RecipeRepository,
  photos: RecipePhotoStore,
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
  subject: string,
  importId: string,
  requestId: string,
): Promise<APIGatewayProxyStructuredResultV2> {
  const input = recipeImportSaveRequestSchema.safeParse(readJson(event));
  if (!input.success) {
    return invalidImport(
      'Review the recipe and complete its required fields before saving.',
      requestId,
    );
  }

  try {
    const preview = await imports.find(subject, importId);
    if (preview === undefined) {
      return errorResponse(
        404,
        'RECIPE_IMPORT_NOT_FOUND',
        'Recipe import not found.',
        requestId,
      );
    }
    if (preview.recipeId !== null && preview.recipeId !== importId) {
      return importConflict(requestId);
    }
    if (preview.recipeId === importId) {
      const existing = await recipes.find(subject, importId);
      return existing === undefined
        ? importConflict(requestId)
        : jsonResponse(
            200,
            recipeSchema.parse(await present(existing, photos)),
          );
    }

    const prepared = prepareRecipeNutrition(input.data.recipe, preview.draft);
    const saved = await recipes.save(
      subject,
      importId,
      prepared.recipe,
      prepared.nutritionProvenance,
    );
    if (saved === undefined) return accountNotBootstrapped(requestId);
    if (!(await imports.markSaved(subject, importId, importId))) {
      return importConflict(requestId);
    }
    return jsonResponse(200, recipeSchema.parse(await present(saved, photos)));
  } catch (error) {
    if (error instanceof RecipeNotFoundError) return importConflict(requestId);
    return databaseError(error, 'recipe_import_save_failed', requestId);
  }
}

async function present(recipe: StoredRecipe, photos: RecipePhotoStore) {
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

function invalidImport(
  message: string,
  requestId: string,
): APIGatewayProxyStructuredResultV2 {
  return errorResponse(400, 'VALIDATION_FAILED', message, requestId);
}

function importConflict(requestId: string): APIGatewayProxyStructuredResultV2 {
  return errorResponse(
    409,
    'RECIPE_IMPORT_ALREADY_SAVED',
    'This recipe import has already been saved.',
    requestId,
  );
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
