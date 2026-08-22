import { randomUUID } from 'node:crypto';
import { RDSDataClient } from '@aws-sdk/client-rds-data';
import type { MealType, RecipeNutrition } from '@macromap/contracts';
import type { GeneratedWeeklyPlan, PlanningRecipe } from '@macromap/domain';
import { and, asc, eq, gte, inArray, isNotNull, isNull, lt } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/aws-data-api/pg';
import type { DataApiDatabaseConfig } from './data-api.js';
import {
  accountIdentities,
  households,
  people,
  recipeIngredients,
  recipes,
  recipeTags,
  weeklyPlans,
} from './schema.js';

export interface WeeklyPlanContext {
  readonly people: ReadonlyArray<{
    readonly displayName: string;
    readonly id: string;
    readonly macroTargets: RecipeNutrition | null;
  }>;
  readonly recentDinnerRecipeIds: ReadonlyArray<string>;
  readonly recipes: ReadonlyArray<PlanningRecipe>;
  readonly snackReserve: number;
}

export type StoredWeeklyPlan = GeneratedWeeklyPlan & {
  readonly generatedAt: string;
  readonly id: string;
  readonly status: 'draft' | 'approved';
  readonly version: number;
};

export interface WeeklyPlanRepository {
  find(
    subject: string,
    weekStart: string,
  ): Promise<StoredWeeklyPlan | undefined>;
  loadContext(
    subject: string,
    weekStart: string,
  ): Promise<WeeklyPlanContext | undefined>;
  replace(
    subject: string,
    plan: GeneratedWeeklyPlan,
  ): Promise<StoredWeeklyPlan | undefined>;
}

export function createDataApiWeeklyPlanRepository(
  config: DataApiDatabaseConfig,
  client: RDSDataClient = new RDSDataClient({}),
): WeeklyPlanRepository {
  const database = drizzle(client, {
    database: config.databaseName,
    resourceArn: config.resourceArn,
    schema: {
      accountIdentities,
      households,
      people,
      recipeIngredients,
      recipes,
      recipeTags,
      weeklyPlans,
    },
    secretArn: config.secretArn,
  });

  return {
    async find(subject, weekStart) {
      const [row] = await database
        .select({
          draft: weeklyPlans.draft,
          generatedAt: weeklyPlans.updatedAt,
          id: weeklyPlans.id,
          status: weeklyPlans.status,
          version: weeklyPlans.version,
        })
        .from(weeklyPlans)
        .innerJoin(
          accountIdentities,
          eq(accountIdentities.householdId, weeklyPlans.householdId),
        )
        .where(
          and(
            eq(accountIdentities.cognitoSubject, subject),
            eq(weeklyPlans.weekStart, weekStart),
          ),
        );
      if (row === undefined) return undefined;
      if (row.status !== 'draft' && row.status !== 'approved') {
        throw new Error('Persisted weekly plan status is invalid.');
      }
      return {
        ...row.draft,
        generatedAt: row.generatedAt.toISOString(),
        id: row.id,
        status: row.status,
        version: row.version,
      };
    },

    async loadContext(subject, weekStart) {
      const [identity] = await database
        .select({
          householdId: accountIdentities.householdId,
          snackReserve: households.snackReserve,
        })
        .from(accountIdentities)
        .innerJoin(households, eq(households.id, accountIdentities.householdId))
        .where(eq(accountIdentities.cognitoSubject, subject));
      if (identity === undefined) return undefined;

      const [profileRows, recipeRows, recentPlans] = await Promise.all([
        database
          .select({
            displayName: people.displayName,
            id: people.id,
            targetCarbsGrams: people.targetCarbsGrams,
            targetFatGrams: people.targetFatGrams,
            targetKcal: people.targetKcal,
            targetProteinGrams: people.targetProteinGrams,
          })
          .from(people)
          .where(
            and(
              eq(people.householdId, identity.householdId),
              eq(people.active, true),
            ),
          )
          .orderBy(asc(people.sortOrder)),
        database
          .select({
            carbsGrams: recipes.nutritionCarbsGrams,
            fatGrams: recipes.nutritionFatGrams,
            id: recipes.id,
            kcal: recipes.nutritionKcal,
            nutritionProvenance: recipes.nutritionProvenance,
            proteinGrams: recipes.nutritionProteinGrams,
            title: recipes.title,
          })
          .from(recipes)
          .where(
            and(
              eq(recipes.householdId, identity.householdId),
              isNull(recipes.archivedAt),
              isNotNull(recipes.nutritionKcal),
              isNotNull(recipes.nutritionProteinGrams),
              isNotNull(recipes.nutritionCarbsGrams),
              isNotNull(recipes.nutritionFatGrams),
            ),
          ),
        database
          .select({ draft: weeklyPlans.draft })
          .from(weeklyPlans)
          .where(
            and(
              eq(weeklyPlans.householdId, identity.householdId),
              gte(weeklyPlans.weekStart, addDays(weekStart, -14)),
              lt(weeklyPlans.weekStart, weekStart),
            ),
          ),
      ]);
      const recipeIds = recipeRows.map(({ id }) => id);
      const [ingredientRows, tagRows] =
        recipeIds.length === 0
          ? [[], []]
          : await Promise.all([
              database
                .select({
                  name: recipeIngredients.name,
                  recipeId: recipeIngredients.recipeId,
                })
                .from(recipeIngredients)
                .where(inArray(recipeIngredients.recipeId, recipeIds)),
              database
                .select({
                  category: recipeTags.category,
                  recipeId: recipeTags.recipeId,
                  value: recipeTags.value,
                })
                .from(recipeTags)
                .where(inArray(recipeTags.recipeId, recipeIds)),
            ]);

      return {
        people: profileRows.map((profile) => ({
          displayName: profile.displayName,
          id: profile.id,
          macroTargets: readMacroTargets(profile),
        })),
        recentDinnerRecipeIds: recentPlans.flatMap(({ draft }) =>
          draft.days.flatMap(({ slots }) =>
            slots.flatMap(({ meal, mealType }) =>
              mealType === 'dinner' && meal !== null ? [meal.recipeId] : [],
            ),
          ),
        ),
        recipes: recipeRows.flatMap((recipe) => {
          const tags = tagRows.filter(({ recipeId }) => recipeId === recipe.id);
          const mealTypes = tagValues(tags, 'meal_type') as MealType[];
          if (mealTypes.length === 0) return [];
          return [
            {
              id: recipe.id,
              ingredients: ingredientRows
                .filter(({ recipeId }) => recipeId === recipe.id)
                .map(({ name }) => name),
              mealTypes,
              nutrition: readRecipeNutrition(recipe),
              nutritionConfidence:
                recipe.nutritionProvenance?.confidence ?? 'confirmed',
              tags: {
                cuisines: tagValues(tags, 'cuisine'),
                flavours: tagValues(tags, 'flavour'),
                proteins: tagValues(tags, 'protein'),
              },
              title: recipe.title,
            },
          ];
        }),
        snackReserve: Number(identity.snackReserve),
      };
    },

    async replace(subject, plan) {
      const now = new Date();
      const stored = await database.transaction(async (transaction) => {
        const [identity] = await transaction
          .select({ householdId: accountIdentities.householdId })
          .from(accountIdentities)
          .where(eq(accountIdentities.cognitoSubject, subject));
        if (identity === undefined) return undefined;

        const [existing] = await transaction
          .select({ id: weeklyPlans.id, version: weeklyPlans.version })
          .from(weeklyPlans)
          .where(
            and(
              eq(weeklyPlans.householdId, identity.householdId),
              eq(weeklyPlans.weekStart, plan.weekStart),
            ),
          );
        const id = existing?.id ?? randomUUID();
        const version = (existing?.version ?? 0) + 1;
        if (existing === undefined) {
          await transaction.insert(weeklyPlans).values({
            draft: plan,
            householdId: identity.householdId,
            id,
            status: 'draft',
            weekStart: plan.weekStart,
          });
        } else {
          await transaction
            .update(weeklyPlans)
            .set({ draft: plan, status: 'draft', updatedAt: now, version })
            .where(eq(weeklyPlans.id, id));
        }
        return { id, version };
      });

      return stored === undefined
        ? undefined
        : {
            ...plan,
            generatedAt: now.toISOString(),
            id: stored.id,
            status: 'draft',
            version: stored.version,
          };
    },
  };
}

function readMacroTargets(row: {
  targetCarbsGrams: string | null;
  targetFatGrams: string | null;
  targetKcal: number | null;
  targetProteinGrams: string | null;
}): RecipeNutrition | null {
  const values = [
    row.targetCarbsGrams,
    row.targetFatGrams,
    row.targetKcal,
    row.targetProteinGrams,
  ];
  if (values.every((value) => value === null)) return null;
  if (values.some((value) => value === null)) {
    throw new Error('Persisted macro targets are incomplete.');
  }
  return {
    carbsGrams: Number(row.targetCarbsGrams),
    fatGrams: Number(row.targetFatGrams),
    kcal: Number(row.targetKcal),
    proteinGrams: Number(row.targetProteinGrams),
  };
}

function readRecipeNutrition(row: {
  carbsGrams: string | null;
  fatGrams: string | null;
  kcal: string | null;
  proteinGrams: string | null;
}): RecipeNutrition {
  if (
    row.carbsGrams === null ||
    row.fatGrams === null ||
    row.kcal === null ||
    row.proteinGrams === null
  ) {
    throw new Error('Persisted recipe nutrition is incomplete.');
  }
  return {
    carbsGrams: Number(row.carbsGrams),
    fatGrams: Number(row.fatGrams),
    kcal: Number(row.kcal),
    proteinGrams: Number(row.proteinGrams),
  };
}

function tagValues(
  tags: ReadonlyArray<{ category: string; value: string }>,
  category: string,
): string[] {
  return tags
    .filter((tag) => tag.category === category)
    .map(({ value }) => value);
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
