create table recipe (
  id uuid primary key,
  household_id uuid not null references household(id) on delete cascade,
  title text not null,
  description text not null,
  serving_count numeric(7, 2) not null,
  nutrition_kcal numeric(9, 2),
  nutrition_protein_g numeric(9, 2),
  nutrition_carbs_g numeric(9, 2),
  nutrition_fat_g numeric(9, 2),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recipe_serving_count_positive check (serving_count > 0),
  constraint recipe_nutrition_complete check (
    num_nulls(
      nutrition_kcal,
      nutrition_protein_g,
      nutrition_carbs_g,
      nutrition_fat_g
    ) in (0, 4)
  ),
  constraint recipe_nutrition_valid check (
    nutrition_kcal is null or (
      nutrition_kcal > 0 and nutrition_protein_g >= 0
      and nutrition_carbs_g >= 0 and nutrition_fat_g >= 0
    )
  )
);
--> statement-breakpoint
create index recipe_household_updated_index
  on recipe (household_id, updated_at desc, id desc);
--> statement-breakpoint
create table recipe_ingredient (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references recipe(id) on delete cascade,
  sort_order integer not null,
  name text not null,
  quantity numeric(12, 3) not null,
  unit text not null,
  preparation_note text not null,
  constraint recipe_ingredient_quantity_positive check (quantity > 0),
  constraint recipe_ingredient_order_unique unique (recipe_id, sort_order)
);
--> statement-breakpoint
create table recipe_step (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references recipe(id) on delete cascade,
  sort_order integer not null,
  instruction text not null,
  constraint recipe_step_order_unique unique (recipe_id, sort_order)
);
--> statement-breakpoint
create table recipe_tag (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references recipe(id) on delete cascade,
  category text not null,
  value text not null,
  constraint recipe_tag_category_valid check (
    category in ('meal_type', 'cuisine', 'protein', 'flavour')
  ),
  constraint recipe_tag_unique unique (recipe_id, category, value)
);
