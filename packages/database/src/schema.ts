import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
};

export const households = pgTable(
  'household',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    displayName: text('display_name').notNull(),
    slug: text('slug').notNull(),
    snackReserve: numeric('snack_reserve', { precision: 5, scale: 4 })
      .default('0.1500')
      .notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex('household_slug_unique').on(table.slug)],
);

export const accountIdentities = pgTable(
  'account_identity',
  {
    cognitoSubject: text('cognito_subject').primaryKey(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('account_identity_household_unique').on(table.householdId),
  ],
);

export const people = pgTable(
  'person',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    active: boolean('active').default(true).notNull(),
    displayName: text('display_name').notNull(),
    slug: text('slug').notNull(),
    sortOrder: integer('sort_order').notNull(),
    targetKcal: integer('target_kcal'),
    targetProteinGrams: numeric('target_protein_g', {
      precision: 7,
      scale: 2,
    }),
    targetCarbsGrams: numeric('target_carbs_g', { precision: 7, scale: 2 }),
    targetFatGrams: numeric('target_fat_g', { precision: 7, scale: 2 }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('person_household_slug_unique').on(
      table.householdId,
      table.slug,
    ),
    uniqueIndex('person_household_sort_order_unique').on(
      table.householdId,
      table.sortOrder,
    ),
  ],
);

export const recipes = pgTable(
  'recipe',
  {
    id: uuid('id').primaryKey(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description').notNull(),
    servingCount: numeric('serving_count', {
      precision: 7,
      scale: 2,
    }).notNull(),
    nutritionKcal: numeric('nutrition_kcal', { precision: 9, scale: 2 }),
    nutritionProteinGrams: numeric('nutrition_protein_g', {
      precision: 9,
      scale: 2,
    }),
    nutritionCarbsGrams: numeric('nutrition_carbs_g', {
      precision: 9,
      scale: 2,
    }),
    nutritionFatGrams: numeric('nutrition_fat_g', {
      precision: 9,
      scale: 2,
    }),
    photoUpdatedAt: timestamp('photo_updated_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index('recipe_household_updated_index').on(
      table.householdId,
      table.updatedAt,
      table.id,
    ),
  ],
);

export const recipeIngredients = pgTable(
  'recipe_ingredient',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    recipeId: uuid('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').notNull(),
    name: text('name').notNull(),
    quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull(),
    unit: text('unit').notNull(),
    preparationNote: text('preparation_note').notNull(),
  },
  (table) => [
    uniqueIndex('recipe_ingredient_order_unique').on(
      table.recipeId,
      table.sortOrder,
    ),
  ],
);

export const recipeSteps = pgTable(
  'recipe_step',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    recipeId: uuid('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').notNull(),
    instruction: text('instruction').notNull(),
  },
  (table) => [
    uniqueIndex('recipe_step_order_unique').on(table.recipeId, table.sortOrder),
  ],
);

export const recipeTags = pgTable(
  'recipe_tag',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    recipeId: uuid('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    category: text('category').notNull(),
    value: text('value').notNull(),
  },
  (table) => [
    uniqueIndex('recipe_tag_unique').on(
      table.recipeId,
      table.category,
      table.value,
    ),
  ],
);
