import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';
import { weeklyPlanSchema } from '@macromap/contracts';
import type {
  WeeklyPlanContext,
  WeeklyPlanRepository,
} from '@macromap/database';
import { generateWeeklyPlan } from '@macromap/domain';
import { databaseErrorResponse, errorResponse, jsonResponse } from './http.js';

export async function handleWeeklyPlanRequest(
  repository: WeeklyPlanRepository,
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
  subject: string,
  requestId: string,
): Promise<APIGatewayProxyStructuredResultV2> {
  const weekStart = event.pathParameters?.weekStart;
  if (!isMonday(weekStart)) {
    return errorResponse(
      400,
      'VALIDATION_FAILED',
      'Choose a week beginning on Monday.',
      requestId,
    );
  }

  if (event.routeKey === 'GET /v1/weekly-plans/{weekStart}') {
    return getPlan(repository, subject, weekStart, requestId);
  }
  if (event.routeKey === 'POST /v1/weekly-plans/{weekStart}/generate') {
    return generatePlan(repository, subject, weekStart, requestId);
  }
  return errorResponse(404, 'NOT_FOUND', 'Endpoint not found.', requestId);
}

async function getPlan(
  repository: WeeklyPlanRepository,
  subject: string,
  weekStart: string,
  requestId: string,
): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const plan = await repository.find(subject, weekStart);
    if (plan === undefined) {
      return errorResponse(
        404,
        'PLAN_NOT_FOUND',
        'No draft has been generated for this week yet.',
        requestId,
      );
    }
    return validatedPlanResponse(plan, requestId);
  } catch (error) {
    return databaseErrorResponse(
      error,
      'weekly_plan_load_failed',
      requestId,
      'MacroMap could not load this weekly plan.',
    );
  }
}

async function generatePlan(
  repository: WeeklyPlanRepository,
  subject: string,
  weekStart: string,
  requestId: string,
): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const context = await repository.loadContext(subject, weekStart);
    if (context === undefined) {
      return errorResponse(
        403,
        'ACCOUNT_NOT_BOOTSTRAPPED',
        'This account has not been connected to MacroMap yet.',
        requestId,
      );
    }
    const people = context.people.filter(hasMacroTargets);
    if (people.length !== context.people.length) {
      return errorResponse(
        422,
        'MACRO_TARGETS_REQUIRED',
        'Set macro targets for every profile before generating a plan.',
        requestId,
      );
    }

    const plan = generateWeeklyPlan({
      ...context,
      people,
      weekStart,
    });
    const stored = await repository.replace(subject, plan);
    if (stored === undefined) {
      return errorResponse(
        403,
        'ACCOUNT_NOT_BOOTSTRAPPED',
        'This account has not been connected to MacroMap yet.',
        requestId,
      );
    }
    return validatedPlanResponse(stored, requestId);
  } catch (error) {
    return databaseErrorResponse(
      error,
      'weekly_plan_generation_failed',
      requestId,
      'MacroMap could not generate this weekly plan.',
    );
  }
}

function hasMacroTargets(
  person: WeeklyPlanContext['people'][number],
): person is WeeklyPlanContext['people'][number] & {
  readonly macroTargets: NonNullable<
    WeeklyPlanContext['people'][number]['macroTargets']
  >;
} {
  return person.macroTargets !== null;
}

function validatedPlanResponse(
  plan: unknown,
  requestId: string,
): APIGatewayProxyStructuredResultV2 {
  const validated = weeklyPlanSchema.safeParse(plan);
  if (validated.success) return jsonResponse(200, validated.data);

  console.error(JSON.stringify({ event: 'invalid_weekly_plan', requestId }));
  return errorResponse(
    500,
    'INTERNAL_ERROR',
    'MacroMap could not load this weekly plan.',
    requestId,
  );
}

function isMonday(value: string | undefined): value is string {
  if (value === undefined || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.valueOf()) &&
    date.toISOString().slice(0, 10) === value &&
    date.getUTCDay() === 1
  );
}
