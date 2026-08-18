alter table recipe
  add column source_name text,
  add column source_url text;
--> statement-breakpoint
create table recipe_import (
  id uuid primary key,
  household_id uuid not null references household(id) on delete cascade,
  source_kind text not null,
  original_content text not null,
  draft jsonb not null,
  warnings jsonb not null,
  recipe_id uuid references recipe(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recipe_import_source_kind_valid check (
    source_kind in ('schema_org_json')
  ),
  constraint recipe_import_recipe_unique unique (recipe_id)
);
--> statement-breakpoint
create index recipe_import_household_created_index
  on recipe_import (household_id, created_at desc);
