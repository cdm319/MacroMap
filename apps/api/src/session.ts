import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';
import {
  apiErrorSchema,
  sessionResponseSchema,
} from '../../../packages/contracts/src/index.js';
import type { SessionRepository } from '../../../packages/database/src/data-api.js';

type SessionHandler = (
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
) => Promise<APIGatewayProxyStructuredResultV2>;

function jsonResponse(
  statusCode: number,
  body: unknown,
): APIGatewayProxyStructuredResultV2 {
  return {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    statusCode,
  };
}

function errorResponse(
  statusCode: number,
  code: string,
  message: string,
  requestId: string,
): APIGatewayProxyStructuredResultV2 {
  return jsonResponse(
    statusCode,
    apiErrorSchema.parse({
      error: { code, message, requestId },
    }),
  );
}

export function createSessionHandler(
  repository: SessionRepository,
): SessionHandler {
  return async (event) => {
    const requestId = event.requestContext.requestId;
    const subject = event.requestContext.authorizer.jwt.claims.sub;

    if (typeof subject !== 'string' || subject.trim() === '') {
      return errorResponse(
        401,
        'AUTHENTICATION_REQUIRED',
        'Sign in is required.',
        requestId,
      );
    }

    let session;
    try {
      session = await repository.findBySubject(subject);
    } catch (error) {
      console.error(
        JSON.stringify({
          errorName: error instanceof Error ? error.name : 'UnknownError',
          event: 'session_load_failed',
          requestId,
        }),
      );
      return errorResponse(
        503,
        'DATABASE_WAKING',
        'MacroMap is waking its database. Please try again shortly.',
        requestId,
      );
    }

    if (session === undefined) {
      return errorResponse(
        403,
        'ACCOUNT_NOT_BOOTSTRAPPED',
        'This account has not been connected to MacroMap yet.',
        requestId,
      );
    }

    const validated = sessionResponseSchema.safeParse(session);
    if (!validated.success) {
      console.error(
        JSON.stringify({ event: 'invalid_session_data', requestId }),
      );
      return errorResponse(
        500,
        'INTERNAL_ERROR',
        'MacroMap could not load your household.',
        requestId,
      );
    }

    return jsonResponse(200, validated.data);
  };
}
