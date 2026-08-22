create table weekly_plan (
  id uuid primary key,
  household_id uuid not null references household(id) on delete cascade,
  week_start_date date not null,
  status text not null default 'draft',
  version integer not null default 1,
  draft jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint weekly_plan_status_valid check (status in ('draft', 'approved')),
  constraint weekly_plan_version_positive check (version > 0),
  constraint weekly_plan_monday_start check (
    extract(isodow from week_start_date) = 1
  ),
  constraint weekly_plan_household_week_unique unique (
    household_id,
    week_start_date
  )
);
