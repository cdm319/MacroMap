import { RDSDataClient } from '@aws-sdk/client-rds-data';
import { and, asc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/aws-data-api/pg';
import { accountIdentities, households, people } from './schema.js';

export interface DataApiDatabaseConfig {
  readonly databaseName: string;
  readonly resourceArn: string;
  readonly secretArn: string;
}

export interface SessionRepository {
  findBySubject(subject: string): Promise<HouseholdSession | undefined>;
}

export interface HouseholdSession {
  readonly household: {
    readonly displayName: string;
    readonly id: string;
  };
  readonly people: ReadonlyArray<{
    readonly displayName: string;
    readonly id: string;
    readonly slug: string;
  }>;
}

export function createDataApiSessionRepository(
  config: DataApiDatabaseConfig,
  client: RDSDataClient = new RDSDataClient({}),
): SessionRepository {
  const database = drizzle(client, {
    database: config.databaseName,
    resourceArn: config.resourceArn,
    schema: { accountIdentities, households, people },
    secretArn: config.secretArn,
  });

  return {
    async findBySubject(subject) {
      const rows = await database
        .select({
          householdDisplayName: households.displayName,
          householdId: households.id,
          personDisplayName: people.displayName,
          personId: people.id,
          personSlug: people.slug,
        })
        .from(accountIdentities)
        .innerJoin(households, eq(accountIdentities.householdId, households.id))
        .innerJoin(
          people,
          and(eq(people.householdId, households.id), eq(people.active, true)),
        )
        .where(eq(accountIdentities.cognitoSubject, subject))
        .orderBy(asc(people.sortOrder), asc(people.id));

      const firstRow = rows[0];
      if (firstRow === undefined) return undefined;

      return {
        household: {
          displayName: firstRow.householdDisplayName,
          id: firstRow.householdId,
        },
        people: rows.map((row) => ({
          displayName: row.personDisplayName,
          id: row.personId,
          slug: row.personSlug,
        })),
      };
    },
  };
}
