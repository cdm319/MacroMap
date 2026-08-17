import {
  boolean,
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
