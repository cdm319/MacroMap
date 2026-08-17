import {
  recipeListResponseSchema,
  recipeSchema,
  type Recipe,
  type RecipeInput,
  type RecipeListResponse,
} from '@macromap/contracts';

export interface RecipeApiConfig {
  readonly accessToken: string;
  readonly baseUrl: string;
}

export async function listRecipes(
  config: RecipeApiConfig,
  cursor?: string,
): Promise<RecipeListResponse> {
  const url = new URL(`${config.baseUrl}/v1/recipes`);
  if (cursor !== undefined) url.searchParams.set('cursor', cursor);
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

export async function archiveRecipe(
  config: RecipeApiConfig,
  recipeId: string,
): Promise<void> {
  await request(config, `${config.baseUrl}/v1/recipes/${recipeId}`, {
    method: 'DELETE',
  });
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
  if (response.status === 503) {
    throw new Error('The database is waking. Please try again shortly.');
  }
  if (!response.ok)
    throw new Error('MacroMap could not complete that request.');
  return response;
}
