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
import { extractJsonLd } from '@macromap/domain/schema-org-html';
import { parseSchemaOrgRecipe } from '@macromap/domain/schema-org-recipe';
import { databaseErrorResponse, errorResponse, jsonResponse } from './http.js';
import { prepareRecipeNutrition } from './nutrition.js';
import type { RecipePhotoStore } from './recipe-photo-store.js';
import {
  RemoteRecipeError,
  type RecipeSourceFetcher,
} from './recipe-source-fetcher.js';

export async function handleRecipeImportRequest(
  imports: RecipeImportRepository,
  recipes: RecipeRepository,
  photos: RecipePhotoStore,
  sources: RecipeSourceFetcher,
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
  subject: string,
  requestId: string,
): Promise<APIGatewayProxyStructuredResultV2> {
  if (event.routeKey === 'POST /v1/recipe-imports/preview') {
    return previewImport(imports, photos, sources, event, subject, requestId);
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
  photos: RecipePhotoStore,
  sources: RecipeSourceFetcher,
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
  subject: string,
  requestId: string,
): Promise<APIGatewayProxyStructuredResultV2> {
  const input = recipeImportPreviewRequestSchema.safeParse(readJson(event));
  if (!input.success) {
    return invalidImport(
      'Enter a valid recipe URL or paste JSON no larger than 512 KB.',
      requestId,
    );
  }

  let content: string;
  let sourceUrl: string | undefined;
  if ('url' in input.data) {
    try {
      const page = await sources.page(input.data.url);
      content =
        page.kind === 'json'
          ? page.content
          : (extractJsonLd(page.content) ?? '');
      sourceUrl = page.finalUrl;
    } catch (error) {
      return remoteError(error, requestId);
    }
    if (content === '') {
      return errorResponse(
        422,
        'NO_RECIPE',
        'No Schema.org Recipe was found on that page.',
        requestId,
      );
    }
  } else {
    content = input.data.content;
  }

  const parsed = parseSchemaOrgRecipe(
    content,
    input.data.recipeIndex,
    sourceUrl,
  );
  if (parsed.kind === 'error') {
    return errorResponse(
      parsed.code === 'INVALID_JSON' && sourceUrl === undefined ? 400 : 422,
      parsed.code,
      sourceUrl === undefined
        ? parsed.message
        : parsed.message.replace('in that JSON', 'on that page'),
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
  let draft = parsed.draft;
  let warnings = [...parsed.warnings];
  if (sourceUrl !== undefined && draft.photoUrl !== null) {
    try {
      const photo = await sources.photo(draft.photoUrl);
      await photos.stageImport(importId, photo.bytes, photo.contentType);
      draft = { ...draft, photoStaged: true };
      warnings = warnings.filter(({ code }) => code !== 'PHOTO_NOT_COPIED');
    } catch (error) {
      console.warn(
        JSON.stringify({
          errorName: error instanceof Error ? error.name : 'UnknownError',
          event: 'recipe_import_photo_stage_failed',
          requestId,
        }),
      );
      warnings = warnings.map((warning) =>
        warning.code === 'PHOTO_NOT_COPIED'
          ? {
              ...warning,
              message:
                'The primary photo could not be copied. You can add one after saving.',
            }
          : warning,
      );
    }
  }
  try {
    const created = await repository.create(
      subject,
      importId,
      content,
      draft,
      warnings,
    );
    if (!created) return accountNotBootstrapped(requestId);
  } catch (error) {
    return databaseErrorResponse(
      error,
      'recipe_import_preview_failed',
      requestId,
      'MacroMap could not prepare that recipe import.',
    );
  }

  return jsonResponse(
    201,
    recipeImportResponseSchema.parse({
      draft,
      importId,
      kind: 'preview',
      warnings,
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
    let savedWithPhoto = saved;
    if (preview.draft.photoStaged) {
      try {
        await photos.publishImport(importId, importId);
        const photoUpdatedAt = new Date();
        if (!(await recipes.setPhoto(subject, importId, photoUpdatedAt))) {
          return importConflict(requestId);
        }
        savedWithPhoto = {
          ...saved,
          photoUpdatedAt: photoUpdatedAt.toISOString(),
        };
      } catch (error) {
        console.error(
          JSON.stringify({
            errorName: error instanceof Error ? error.name : 'UnknownError',
            event: 'recipe_import_photo_publish_failed',
            requestId,
          }),
        );
        return errorResponse(
          503,
          'RECIPE_PHOTO_COPY_FAILED',
          'MacroMap could not copy the primary photo. Try saving again.',
          requestId,
        );
      }
    }
    if (!(await imports.markSaved(subject, importId, importId))) {
      return importConflict(requestId);
    }
    return jsonResponse(
      200,
      recipeSchema.parse(await present(savedWithPhoto, photos)),
    );
  } catch (error) {
    if (error instanceof RecipeNotFoundError) return importConflict(requestId);
    return databaseErrorResponse(
      error,
      'recipe_import_save_failed',
      requestId,
      'MacroMap could not save that recipe import.',
    );
  }
}

function remoteError(
  error: unknown,
  requestId: string,
): APIGatewayProxyStructuredResultV2 {
  if (error instanceof RemoteRecipeError) {
    return errorResponse(422, error.code, error.message, requestId);
  }
  console.error(
    JSON.stringify({
      errorName: error instanceof Error ? error.name : 'UnknownError',
      event: 'recipe_url_fetch_failed',
      requestId,
    }),
  );
  return errorResponse(
    503,
    'REMOTE_FETCH_FAILED',
    'MacroMap could not reach that recipe page.',
    requestId,
  );
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
