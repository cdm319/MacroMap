import {
  apiErrorSchema,
  weeklyPlanSchema,
  type WeeklyPlan,
} from '@macromap/contracts';
import { apiRequest, type ApiConfig } from './api-client';

export async function getWeeklyPlan(
  config: ApiConfig,
  weekStart: string,
): Promise<WeeklyPlan | null> {
  const response = await fetch(
    `${config.baseUrl}/v1/weekly-plans/${weekStart}`,
    { headers: { authorization: `Bearer ${config.accessToken}` } },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw await responseError(response);
  return weeklyPlanSchema.parse(await response.json());
}

export async function generateWeeklyPlan(
  config: ApiConfig,
  weekStart: string,
): Promise<WeeklyPlan> {
  const response = await apiRequest(
    config,
    `${config.baseUrl}/v1/weekly-plans/${weekStart}/generate`,
    { method: 'POST' },
  );
  return weeklyPlanSchema.parse(await response.json());
}

async function responseError(response: Response): Promise<Error> {
  if (response.status === 401) {
    return new Error('Your session ended. Please sign in again.');
  }
  const error = apiErrorSchema.safeParse(
    await response.json().catch(() => null),
  );
  return new Error(
    error.success
      ? error.data.error.message
      : 'MacroMap could not complete that request.',
  );
}
