import { apiErrorSchema } from '@macromap/contracts';

export interface ApiConfig {
  readonly accessToken: string;
  readonly baseUrl: string;
}

export async function apiRequest(
  config: ApiConfig,
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
