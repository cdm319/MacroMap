import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import type { ApiError } from '@macromap/contracts';

export function jsonResponse(
  statusCode: number,
  body: unknown,
): APIGatewayProxyStructuredResultV2 {
  return {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    statusCode,
  };
}

export function errorResponse(
  statusCode: number,
  code: string,
  message: string,
  requestId: string,
): APIGatewayProxyStructuredResultV2 {
  return jsonResponse(statusCode, {
    error: { code, message, requestId },
  } satisfies ApiError);
}

export function databaseErrorResponse(
  error: unknown,
  event: string,
  requestId: string,
  message: string,
): APIGatewayProxyStructuredResultV2 {
  console.error(
    JSON.stringify({
      errorName: error instanceof Error ? error.name : 'UnknownError',
      event,
      requestId,
    }),
  );
  return isDatabaseResuming(error)
    ? errorResponse(
        503,
        'DATABASE_WAKING',
        'MacroMap is waking its database. Please try again shortly.',
        requestId,
      )
    : errorResponse(500, 'INTERNAL_ERROR', message, requestId);
}

function isDatabaseResuming(error: unknown): boolean {
  while (error instanceof Error) {
    if (error.name === 'DatabaseResumingException') return true;
    error = error.cause;
  }
  return false;
}
