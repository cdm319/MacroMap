create table household (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  slug text not null unique,
  snack_reserve numeric(5, 4) not null default 0.1500,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint household_snack_reserve_range check (
    snack_reserve >= 0 and snack_reserve < 1
  )
);
--> statement-breakpoint
create table account_identity (
  cognito_subject text primary key,
  household_id uuid not null unique references household(id) on delete restrict,
  created_at timestamptz not null default now()
);
--> statement-breakpoint
create table person (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references household(id) on delete cascade,
  active boolean not null default true,
  display_name text not null,
  slug text not null,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint person_household_slug_unique unique (household_id, slug),
  constraint person_household_sort_order_unique unique (household_id, sort_order)
);
--> statement-breakpoint
insert into household (id, display_name, slug)
values ('00000000-0000-4000-8000-000000000001', 'Chris & Alex', 'default');
--> statement-breakpoint
insert into person (id, household_id, display_name, slug, sort_order)
values
  (
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000001',
    'Chris',
    'chris',
    1
  ),
  (
    '00000000-0000-4000-8000-000000000102',
    '00000000-0000-4000-8000-000000000001',
    'Alex',
    'alex',
    2
  );
