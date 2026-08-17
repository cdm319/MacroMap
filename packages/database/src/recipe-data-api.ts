import { RDSDataClient } from '@aws-sdk/client-rds-data';
import type {
  MealType,
  RecipeInput,
  RecipeNutrition,
} from '@macromap/contracts';
import { and, asc, desc, eq, inArray, isNull, lt, or } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/aws-data-api/pg';
import type { DataApiDatabaseConfig } from './data-api.js';
import {
  accountIdentities,
  recipeIngredients,
  recipes,
  recipeSteps,
  recipeTags,
} from './schema.js';

export interface RecipePageCursor {
  readonly id: string;
  readonly updatedAt: Date;
}

export interface RecipePage {
  readonly items: ReadonlyArray<StoredRecipeSummary>;
  readonly nextCursor: RecipePageCursor | null;
}

export interface StoredRecipeSummary {
  readonly id: string;
  readonly mealTypes: ReadonlyArray<MealType>;
  readonly nutrition: RecipeNutrition | null;
  readonly photoUpdatedAt: string | null;
  readonly planningStatus: 'needs-nutrition' | 'ready';
  readonly servingCount: number;
  readonly title: string;
  readonly updatedAt: string;
}

export type StoredRecipe = RecipeInput & StoredRecipeSummary;

export interface RecipeRepository {
  archive(subject: string, recipeId: string): Promise<boolean>;
  find(subject: string, recipeId: string): Promise<StoredRecipe | undefined>;
  list(
    subject: string,
    cursor?: RecipePageCursor,
  ): Promise<RecipePage | undefined>;
  save(
    subject: string,
    recipeId: string,
    recipe: RecipeInput,
  ): Promise<StoredRecipe | undefined>;
  setPhoto(
    subject: string,
    recipeId: string,
    updatedAt: Date | null,
  ): Promise<boolean>;
}

export class RecipeNotFoundError extends Error {
  public constructor() {
    super('Recipe not found.');
    this.name = 'RecipeNotFoundError';
  }
}

const pageSize = 50;

export function createDataApiRecipeRepository(
  config: DataApiDatabaseConfig,
  client: RDSDataClient = new RDSDataClient({}),
): RecipeRepository {
  const database = drizzle(client, {
    database: config.databaseName,
    resourceArn: config.resourceArn,
    schema: {
      accountIdentities,
      recipeIngredients,
      recipes,
      recipeSteps,
      recipeTags,
    },
    secretArn: config.secretArn,
  });

  return {
    async archive(subject, recipeId) {
      const [identity] = await database
        .select({ householdId: accountIdentities.householdId })
        .from(accountIdentities)
        .where(eq(accountIdentities.cognitoSubject, subject));
      if (identity === undefined) return false;

      const archived = await database
        .update(recipes)
        .set({ archivedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(recipes.id, recipeId),
            eq(recipes.householdId, identity.householdId),
            isNull(recipes.archivedAt),
          ),
        )
        .returning({ id: recipes.id });
      return archived.length === 1;
    },

    async find(subject, recipeId) {
      const [recipe] = await database
        .select(recipeColumns)
        .from(recipes)
        .innerJoin(
          accountIdentities,
          eq(accountIdentities.householdId, recipes.householdId),
        )
        .where(
          and(
            eq(accountIdentities.cognitoSubject, subject),
            eq(recipes.id, recipeId),
            isNull(recipes.archivedAt),
          ),
        );
      if (recipe === undefined) return undefined;

      const [ingredients, steps, tags] = await Promise.all([
        database
          .select({
            name: recipeIngredients.name,
            preparationNote: recipeIngredients.preparationNote,
            quantity: recipeIngredients.quantity,
            unit: recipeIngredients.unit,
          })
          .from(recipeIngredients)
          .where(eq(recipeIngredients.recipeId, recipeId))
          .orderBy(asc(recipeIngredients.sortOrder)),
        database
          .select({ instruction: recipeSteps.instruction })
          .from(recipeSteps)
          .where(eq(recipeSteps.recipeId, recipeId))
          .orderBy(asc(recipeSteps.sortOrder)),
        database
          .select({ category: recipeTags.category, value: recipeTags.value })
          .from(recipeTags)
          .where(eq(recipeTags.recipeId, recipeId))
          .orderBy(asc(recipeTags.category), asc(recipeTags.value)),
      ]);

      return readRecipe(recipe, ingredients, steps, tags);
    },

    async list(subject, cursor) {
      const cursorFilter =
        cursor === undefined
          ? undefined
          : or(
              lt(recipes.updatedAt, cursor.updatedAt),
              and(
                eq(recipes.updatedAt, cursor.updatedAt),
                lt(recipes.id, cursor.id),
              ),
            );
      const rows = await database
        .select(recipeColumns)
        .from(recipes)
        .innerJoin(
          accountIdentities,
          eq(accountIdentities.householdId, recipes.householdId),
        )
        .where(
          and(
            eq(accountIdentities.cognitoSubject, subject),
            isNull(recipes.archivedAt),
            cursorFilter,
          ),
        )
        .orderBy(desc(recipes.updatedAt), desc(recipes.id))
        .limit(pageSize + 1);

      const [identity] = await database
        .select({ householdId: accountIdentities.householdId })
        .from(accountIdentities)
        .where(eq(accountIdentities.cognitoSubject, subject));
      if (identity === undefined) return undefined;

      const visibleRows = rows.slice(0, pageSize);
      const ids = visibleRows.map(({ id }) => id);
      const mealTypes =
        ids.length === 0
          ? []
          : await database
              .select({
                recipeId: recipeTags.recipeId,
                value: recipeTags.value,
              })
              .from(recipeTags)
              .where(
                and(
                  inArray(recipeTags.recipeId, ids),
                  eq(recipeTags.category, 'meal_type'),
                ),
              )
              .orderBy(asc(recipeTags.value));

      const last = visibleRows.at(-1);
      return {
        items: visibleRows.map((recipe) => ({
          ...readRecipeSummary(recipe),
          mealTypes: mealTypes
            .filter(({ recipeId }) => recipeId === recipe.id)
            .map(({ value }) => value as MealType),
        })),
        nextCursor:
          rows.length > pageSize && last !== undefined
            ? { id: last.id, updatedAt: last.updatedAt }
            : null,
      };
    },

    async save(subject, recipeId, input) {
      return database.transaction(async (transaction) => {
        const [identity] = await transaction
          .select({ householdId: accountIdentities.householdId })
          .from(accountIdentities)
          .where(eq(accountIdentities.cognitoSubject, subject));
        if (identity === undefined) return undefined;

        const [existing] = await transaction
          .select({
            archivedAt: recipes.archivedAt,
            householdId: recipes.householdId,
            photoUpdatedAt: recipes.photoUpdatedAt,
          })
          .from(recipes)
          .where(eq(recipes.id, recipeId));
        if (
          existing !== undefined &&
          (existing.householdId !== identity.householdId ||
            existing.archivedAt !== null)
        ) {
          throw new RecipeNotFoundError();
        }

        const updatedAt = new Date();
        const values = {
          description: input.description,
          householdId: identity.householdId,
          nutritionCarbsGrams: numeric(input.nutrition?.carbsGrams),
          nutritionFatGrams: numeric(input.nutrition?.fatGrams),
          nutritionKcal: numeric(input.nutrition?.kcal),
          nutritionProteinGrams: numeric(input.nutrition?.proteinGrams),
          servingCount: String(input.servingCount),
          title: input.title,
          updatedAt,
        };
        if (existing === undefined) {
          await transaction.insert(recipes).values({ id: recipeId, ...values });
        } else {
          await transaction
            .update(recipes)
            .set(values)
            .where(
              and(
                eq(recipes.id, recipeId),
                eq(recipes.householdId, identity.householdId),
              ),
            );
          await transaction
            .delete(recipeIngredients)
            .where(eq(recipeIngredients.recipeId, recipeId));
          await transaction
            .delete(recipeSteps)
            .where(eq(recipeSteps.recipeId, recipeId));
          await transaction
            .delete(recipeTags)
            .where(eq(recipeTags.recipeId, recipeId));
        }

        await transaction.insert(recipeIngredients).values(
          input.ingredients.map((ingredient, sortOrder) => ({
            ...ingredient,
            quantity: String(ingredient.quantity),
            recipeId,
            sortOrder,
          })),
        );
        await transaction.insert(recipeSteps).values(
          input.instructions.map((instruction, sortOrder) => ({
            instruction,
            recipeId,
            sortOrder,
          })),
        );
        await transaction.insert(recipeTags).values([
          ...input.mealTypes.map((value) => ({
            category: 'meal_type',
            recipeId,
            value,
          })),
          ...input.tags.cuisines.map((value) => ({
            category: 'cuisine',
            recipeId,
            value,
          })),
          ...input.tags.proteins.map((value) => ({
            category: 'protein',
            recipeId,
            value,
          })),
          ...input.tags.flavours.map((value) => ({
            category: 'flavour',
            recipeId,
            value,
          })),
        ]);

        return {
          ...input,
          id: recipeId,
          mealTypes: input.mealTypes,
          photoUpdatedAt: existing?.photoUpdatedAt?.toISOString() ?? null,
          planningStatus:
            input.nutrition === null ? 'needs-nutrition' : 'ready',
          updatedAt: updatedAt.toISOString(),
        };
      });
    },

    async setPhoto(subject, recipeId, updatedAt) {
      const [identity] = await database
        .select({ householdId: accountIdentities.householdId })
        .from(accountIdentities)
        .where(eq(accountIdentities.cognitoSubject, subject));
      if (identity === undefined) return false;

      const updated = await database
        .update(recipes)
        .set({ photoUpdatedAt: updatedAt, updatedAt: new Date() })
        .where(
          and(
            eq(recipes.id, recipeId),
            eq(recipes.householdId, identity.householdId),
            isNull(recipes.archivedAt),
          ),
        )
        .returning({ id: recipes.id });
      return updated.length === 1;
    },
  };
}

const recipeColumns = {
  description: recipes.description,
  id: recipes.id,
  nutritionCarbsGrams: recipes.nutritionCarbsGrams,
  nutritionFatGrams: recipes.nutritionFatGrams,
  nutritionKcal: recipes.nutritionKcal,
  nutritionProteinGrams: recipes.nutritionProteinGrams,
  photoUpdatedAt: recipes.photoUpdatedAt,
  servingCount: recipes.servingCount,
  title: recipes.title,
  updatedAt: recipes.updatedAt,
};

interface RecipeRow {
  readonly description: string;
  readonly id: string;
  readonly nutritionCarbsGrams: string | null;
  readonly nutritionFatGrams: string | null;
  readonly nutritionKcal: string | null;
  readonly nutritionProteinGrams: string | null;
  readonly photoUpdatedAt: Date | null;
  readonly servingCount: string;
  readonly title: string;
  readonly updatedAt: Date;
}

function numeric(value: number | undefined): string | null {
  return value === undefined ? null : String(value);
}

function readRecipeSummary(
  recipe: RecipeRow,
): Omit<StoredRecipeSummary, 'mealTypes'> {
  const nutrition = readNutrition(recipe);
  return {
    id: recipe.id,
    nutrition,
    photoUpdatedAt: recipe.photoUpdatedAt?.toISOString() ?? null,
    planningStatus: nutrition === null ? 'needs-nutrition' : 'ready',
    servingCount: Number(recipe.servingCount),
    title: recipe.title,
    updatedAt: recipe.updatedAt.toISOString(),
  };
}

function readNutrition(recipe: RecipeRow): RecipeNutrition | null {
  const values = [
    recipe.nutritionKcal,
    recipe.nutritionProteinGrams,
    recipe.nutritionCarbsGrams,
    recipe.nutritionFatGrams,
  ];
  if (values.every((value) => value === null)) return null;
  if (values.some((value) => value === null)) {
    throw new Error('Persisted recipe nutrition is incomplete.');
  }
  return {
    carbsGrams: Number(recipe.nutritionCarbsGrams),
    fatGrams: Number(recipe.nutritionFatGrams),
    kcal: Number(recipe.nutritionKcal),
    proteinGrams: Number(recipe.nutritionProteinGrams),
  };
}

function readRecipe(
  recipe: RecipeRow,
  ingredients: ReadonlyArray<{
    name: string;
    preparationNote: string;
    quantity: string;
    unit: string;
  }>,
  steps: ReadonlyArray<{ instruction: string }>,
  tags: ReadonlyArray<{ category: string; value: string }>,
): StoredRecipe {
  return {
    ...readRecipeSummary(recipe),
    description: recipe.description,
    ingredients: ingredients.map((ingredient) => ({
      ...ingredient,
      quantity: Number(ingredient.quantity),
    })),
    instructions: steps.map(({ instruction }) => instruction),
    mealTypes: tagValues(tags, 'meal_type') as MealType[],
    tags: {
      cuisines: tagValues(tags, 'cuisine'),
      flavours: tagValues(tags, 'flavour'),
      proteins: tagValues(tags, 'protein'),
    },
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
