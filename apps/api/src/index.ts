export interface HealthResponse {
  readonly service: 'macromap-api';
  readonly status: 'ok';
  readonly time: string;
}

export function createHealthResponse(now: Date = new Date()): HealthResponse {
  return {
    service: 'macromap-api',
    status: 'ok',
    time: now.toISOString(),
  };
}
