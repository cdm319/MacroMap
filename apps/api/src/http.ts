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
