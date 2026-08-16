import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';
import {
  createDataApiSessionRepository,
  type SessionRepository,
} from '@macromap/database';
import { handleSession } from './session.js';

function requireEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(`${name} is required.`);
  }
  return value;
}

let repository: SessionRepository | undefined;

function getRepository(): SessionRepository {
  repository ??= createDataApiSessionRepository({
    databaseName: requireEnvironment('DATABASE_NAME'),
    resourceArn: requireEnvironment('DATABASE_RESOURCE_ARN'),
    secretArn: requireEnvironment('DATABASE_SECRET_ARN'),
  });
  return repository;
}

export async function handler(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyStructuredResultV2> {
  return handleSession(getRepository(), event);
}
