import {
  apiErrorSchema,
  recipeImportResponseSchema,
  recipeImportSaveRequestSchema,
  recipePhotoResponseSchema,
  recipePhotoUploadRequestSchema,
  recipePhotoUploadResponseSchema,
  recipeListResponseSchema,
  recipeSchema,
  type Recipe,
  type RecipeInput,
  type RecipeImportResponse,
  type RecipeListResponse,
  type RecipeListSort,
} from '@macromap/contracts';

export interface RecipeApiConfig {
  readonly accessToken: string;
  readonly baseUrl: string;
}

export interface RecipeListOptions {
  readonly cursor?: string;
  readonly search?: string;
  readonly sort?: RecipeListSort;
}

export async function listRecipes(
  config: RecipeApiConfig,
  options: RecipeListOptions = {},
): Promise<RecipeListResponse> {
  const url = new URL(`${config.baseUrl}/v1/recipes`);
  if (options.cursor !== undefined) {
    url.searchParams.set('cursor', options.cursor);
  }
  if (options.search !== undefined) {
    url.searchParams.set('search', options.search);
  }
  if (options.sort !== undefined && options.sort !== 'updated') {
    url.searchParams.set('sort', options.sort);
  }
  const response = await request(config, url);
  return recipeListResponseSchema.parse(await response.json());
}

export async function getRecipe(
  config: RecipeApiConfig,
  recipeId: string,
): Promise<Recipe> {
  const response = await request(
    config,
    `${config.baseUrl}/v1/recipes/${recipeId}`,
  );
  return recipeSchema.parse(await response.json());
}

export async function saveRecipe(
  config: RecipeApiConfig,
  recipeId: string,
  input: RecipeInput,
): Promise<Recipe> {
  const response = await request(
    config,
    `${config.baseUrl}/v1/recipes/${recipeId}`,
    {
      body: JSON.stringify(input),
      headers: { 'content-type': 'application/json' },
      method: 'PUT',
    },
  );
  return recipeSchema.parse(await response.json());
}

export async function previewRecipeImport(
  config: RecipeApiConfig,
  content: string,
  recipeIndex?: number,
): Promise<RecipeImportResponse> {
  const response = await request(
    config,
    `${config.baseUrl}/v1/recipe-imports/preview`,
    {
      body: JSON.stringify({ content, recipeIndex }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    },
  );
  return recipeImportResponseSchema.parse(await response.json());
}

export async function previewRecipeUrl(
  config: RecipeApiConfig,
  url: string,
  recipeIndex?: number,
): Promise<RecipeImportResponse> {
  const response = await request(
    config,
    `${config.baseUrl}/v1/recipe-imports/preview`,
    {
      body: JSON.stringify({ recipeIndex, url }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    },
  );
  return recipeImportResponseSchema.parse(await response.json());
}

export async function saveRecipeImport(
  config: RecipeApiConfig,
  importId: string,
  recipe: RecipeInput,
): Promise<Recipe> {
  const body = recipeImportSaveRequestSchema.parse({ recipe });
  const response = await request(
    config,
    `${config.baseUrl}/v1/recipe-imports/${importId}/save`,
    {
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    },
  );
  return recipeSchema.parse(await response.json());
}

export async function archiveRecipe(
  config: RecipeApiConfig,
  recipeId: string,
): Promise<void> {
  await request(config, `${config.baseUrl}/v1/recipes/${recipeId}`, {
    method: 'DELETE',
  });
}

export async function uploadRecipePhoto(
  config: RecipeApiConfig,
  recipeId: string,
  file: File,
): Promise<string> {
  const input = validateRecipePhoto(file);
  const createResponse = await request(
    config,
    `${config.baseUrl}/v1/recipes/${recipeId}/photos`,
    {
      body: JSON.stringify(input),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    },
  );
  const upload = recipePhotoUploadResponseSchema.parse(
    await createResponse.json(),
  );
  const uploaded = await fetch(upload.uploadUrl, {
    body: file,
    headers: { 'content-type': input.contentType },
    method: 'PUT',
  });
  if (!uploaded.ok) throw new Error('MacroMap could not upload that photo.');

  const completeResponse = await request(
    config,
    `${config.baseUrl}/v1/recipes/${recipeId}/photos/${upload.uploadId}`,
    { method: 'PUT' },
  );
  return recipePhotoResponseSchema.parse(await completeResponse.json())
    .photoUrl;
}

export async function deleteRecipePhoto(
  config: RecipeApiConfig,
  recipeId: string,
): Promise<void> {
  await request(config, `${config.baseUrl}/v1/recipes/${recipeId}/photos`, {
    method: 'DELETE',
  });
}

export function validateRecipePhoto(file: File) {
  const input = recipePhotoUploadRequestSchema.safeParse({
    contentType: file.type,
    sizeBytes: file.size,
  });
  if (!input.success) {
    throw new Error('Choose a JPEG, PNG, or WebP image no larger than 5 MB.');
  }
  return input.data;
}

async function request(
  config: RecipeApiConfig,
  input: string | URL,
  init: RequestInit = {},
): Promise<Response> {
  const response = await fetch(input, {
    ...init,
    headers: {
      authorization: `Bearer ${config.accessToken}`,
      ...init.headers,
    },
  });
  if (response.status === 401) {
    throw new Error('Your session ended. Please sign in again.');
  }
  if (!response.ok) {
    const error = apiErrorSchema.safeParse(
      await response.json().catch(() => null),
    );
    throw new Error(
      error.success
        ? error.data.error.message
        : 'MacroMap could not complete that request.',
    );
  }
  return response;
}
