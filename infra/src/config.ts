export const APPLICATION_NAME = 'MacroMap';
export const APPLICATION_DOMAIN = 'macromap.chrismatthews.me';
export const DATABASE_NAME = 'macromap';
export const GITHUB_REPOSITORY = 'cdm319/MacroMap';
export const PRODUCTION_REGION = 'eu-west-2';
export const ROOT_DOMAIN = 'chrismatthews.me';

export const APPROVED_COST_GUARDRAILS = {
  apiBurstLimit: 10,
  apiLambdaReservedConcurrency: 4,
  apiRateLimit: 5,
  auroraAutoPauseSeconds: 300,
  auroraMaximumCapacity: 1,
  auroraMinimumCapacity: 0,
  logRetentionDays: 14,
  plannerLambdaReservedConcurrency: 1,
  schedulerCount: 1,
  urgentBudgetUsd: 15,
  warningBudgetUsd: 8,
} as const;
