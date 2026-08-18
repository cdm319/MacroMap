import { RDSDataClient } from '@aws-sdk/client-rds-data';
import {
  recipeImportDraftSchema,
  recipeImportWarningSchema,
  type RecipeImportDraft,
  type RecipeImportWarning,
} from '@macromap/contracts';
import { and, eq, isNull, or } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/aws-data-api/pg';
import type { DataApiDatabaseConfig } from './data-api.js';
import { accountIdentities, recipeImports } from './schema.js';

export interface StoredRecipeImport {
  readonly draft: RecipeImportDraft;
  readonly recipeId: string | null;
  readonly warnings: ReadonlyArray<RecipeImportWarning>;
}

export interface RecipeImportRepository {
  create(
    subject: string,
    importId: string,
    originalContent: string,
    draft: RecipeImportDraft,
    warnings: ReadonlyArray<RecipeImportWarning>,
  ): Promise<boolean>;
  find(
    subject: string,
    importId: string,
  ): Promise<StoredRecipeImport | undefined>;
  markSaved(
    subject: string,
    importId: string,
    recipeId: string,
  ): Promise<boolean>;
}

export function createDataApiRecipeImportRepository(
  config: DataApiDatabaseConfig,
  client: RDSDataClient = new RDSDataClient({}),
): RecipeImportRepository {
  const database = drizzle(client, {
    database: config.databaseName,
    resourceArn: config.resourceArn,
    schema: { accountIdentities, recipeImports },
    secretArn: config.secretArn,
  });

  async function householdId(subject: string): Promise<string | undefined> {
    const [identity] = await database
      .select({ householdId: accountIdentities.householdId })
      .from(accountIdentities)
      .where(eq(accountIdentities.cognitoSubject, subject));
    return identity?.householdId;
  }

  return {
    async create(subject, importId, originalContent, draft, warnings) {
      const ownerId = await householdId(subject);
      if (ownerId === undefined) return false;
      await database.insert(recipeImports).values({
        draft,
        householdId: ownerId,
        id: importId,
        originalContent,
        sourceKind: 'schema_org_json',
        warnings: [...warnings],
      });
      return true;
    },

    async find(subject, importId) {
      const [row] = await database
        .select({
          draft: recipeImports.draft,
          recipeId: recipeImports.recipeId,
          warnings: recipeImports.warnings,
        })
        .from(recipeImports)
        .innerJoin(
          accountIdentities,
          eq(accountIdentities.householdId, recipeImports.householdId),
        )
        .where(
          and(
            eq(accountIdentities.cognitoSubject, subject),
            eq(recipeImports.id, importId),
          ),
        );
      if (row === undefined) return undefined;
      return {
        draft: recipeImportDraftSchema.parse(row.draft),
        recipeId: row.recipeId,
        warnings: recipeImportWarningSchema.array().parse(row.warnings),
      };
    },

    async markSaved(subject, importId, recipeId) {
      const ownerId = await householdId(subject);
      if (ownerId === undefined) return false;
      const updated = await database
        .update(recipeImports)
        .set({ recipeId, reviewedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(recipeImports.id, importId),
            eq(recipeImports.householdId, ownerId),
            or(
              isNull(recipeImports.recipeId),
              eq(recipeImports.recipeId, recipeId),
            ),
          ),
        )
        .returning({ id: recipeImports.id });
      return updated.length === 1;
    },
  };
}
