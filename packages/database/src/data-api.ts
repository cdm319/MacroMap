import { RDSDataClient } from '@aws-sdk/client-rds-data';
import { and, asc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/aws-data-api/pg';
import { accountIdentities, households, people } from './schema.js';

export interface DataApiDatabaseConfig {
  readonly databaseName: string;
  readonly resourceArn: string;
  readonly secretArn: string;
}

export interface HouseholdRepository {
  findBySubject(subject: string): Promise<HouseholdSession | undefined>;
  updateSettings(
    subject: string,
    settings: HouseholdSettings,
  ): Promise<HouseholdSession | undefined>;
}

export interface HouseholdSettings {
  readonly people: ReadonlyArray<{
    readonly id: string;
    readonly macroTargets: MacroTargets;
  }>;
  readonly snackReserve: number;
}

export interface MacroTargets {
  readonly carbsGrams: number;
  readonly fatGrams: number;
  readonly kcal: number;
  readonly proteinGrams: number;
}

export interface HouseholdSession {
  readonly household: {
    readonly displayName: string;
    readonly id: string;
    readonly snackReserve: number;
  };
  readonly people: ReadonlyArray<{
    readonly displayName: string;
    readonly id: string;
    readonly macroTargets: MacroTargets | null;
    readonly slug: string;
  }>;
}

export class HouseholdPeopleMismatchError extends Error {
  public constructor() {
    super('Settings must include every active household profile exactly once.');
    this.name = 'HouseholdPeopleMismatchError';
  }
}

export function createDataApiHouseholdRepository(
  config: DataApiDatabaseConfig,
  client: RDSDataClient = new RDSDataClient({}),
): HouseholdRepository {
  const database = drizzle(client, {
    database: config.databaseName,
    resourceArn: config.resourceArn,
    schema: { accountIdentities, households, people },
    secretArn: config.secretArn,
  });

  async function findBySubject(
    subject: string,
  ): Promise<HouseholdSession | undefined> {
    const rows = await database
      .select({
        householdDisplayName: households.displayName,
        householdId: households.id,
        personDisplayName: people.displayName,
        personId: people.id,
        personSlug: people.slug,
        snackReserve: households.snackReserve,
        targetCarbsGrams: people.targetCarbsGrams,
        targetFatGrams: people.targetFatGrams,
        targetKcal: people.targetKcal,
        targetProteinGrams: people.targetProteinGrams,
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
        snackReserve: Number(firstRow.snackReserve),
      },
      people: rows.map((row) => {
        const targets = [
          row.targetKcal,
          row.targetProteinGrams,
          row.targetCarbsGrams,
          row.targetFatGrams,
        ];
        const macroTargets = targets.every((value) => value === null)
          ? null
          : readMacroTargets(row);

        return {
          displayName: row.personDisplayName,
          id: row.personId,
          macroTargets,
          slug: row.personSlug,
        };
      }),
    };
  }

  return {
    findBySubject,
    async updateSettings(subject, settings) {
      const householdId = await database.transaction(async (transaction) => {
        const [identity] = await transaction
          .select({ householdId: accountIdentities.householdId })
          .from(accountIdentities)
          .where(eq(accountIdentities.cognitoSubject, subject));
        if (identity === undefined) return undefined;

        const activePeople = await transaction
          .select({ id: people.id })
          .from(people)
          .where(
            and(
              eq(people.householdId, identity.householdId),
              eq(people.active, true),
            ),
          );
        const requestedIds = new Set(settings.people.map(({ id }) => id));
        if (
          requestedIds.size !== settings.people.length ||
          requestedIds.size !== activePeople.length ||
          activePeople.some(({ id }) => !requestedIds.has(id))
        ) {
          throw new HouseholdPeopleMismatchError();
        }

        const updatedAt = new Date();
        await transaction
          .update(households)
          .set({
            snackReserve: String(settings.snackReserve),
            updatedAt,
          })
          .where(eq(households.id, identity.householdId));

        for (const person of settings.people) {
          await transaction
            .update(people)
            .set({
              targetCarbsGrams: String(person.macroTargets.carbsGrams),
              targetFatGrams: String(person.macroTargets.fatGrams),
              targetKcal: person.macroTargets.kcal,
              targetProteinGrams: String(person.macroTargets.proteinGrams),
              updatedAt,
            })
            .where(
              and(
                eq(people.id, person.id),
                eq(people.householdId, identity.householdId),
              ),
            );
        }

        return identity.householdId;
      });

      return householdId === undefined ? undefined : findBySubject(subject);
    },
  };
}

function readMacroTargets(row: {
  targetCarbsGrams: string | null;
  targetFatGrams: string | null;
  targetKcal: number | null;
  targetProteinGrams: string | null;
}): MacroTargets {
  if (
    row.targetCarbsGrams === null ||
    row.targetFatGrams === null ||
    row.targetKcal === null ||
    row.targetProteinGrams === null
  ) {
    throw new Error('Persisted macro targets are incomplete.');
  }

  return {
    carbsGrams: Number(row.targetCarbsGrams),
    fatGrams: Number(row.targetFatGrams),
    kcal: row.targetKcal,
    proteinGrams: Number(row.targetProteinGrams),
  };
}
