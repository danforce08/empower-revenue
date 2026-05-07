-- Empower Revenue Dashboard — initial schema
-- Tables defined per spec §3. All Phase 2-3 tables ship in MVP migration; rows
-- stay empty until the corresponding phase ships.

set check_function_bodies = off;

-- ──────────────────────────────────────────────────────────────────────────────
-- users  (mirrors auth.users.id; role + channel allowlist live here)
-- ──────────────────────────────────────────────────────────────────────────────
create table public.users (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null unique check (email = lower(email)),
  name          text not null,
  role          text not null check (role in ('admin', 'owner', 'viewer')),
  channels      uuid[] not null default '{}'::uuid[],
  created_at    timestamptz not null default now()
);

-- ──────────────────────────────────────────────────────────────────────────────
-- sources (Dealer sub-channels: Empower X, Genesis, Ion, ...)
-- ──────────────────────────────────────────────────────────────────────────────
create table public.sources (
  key           text primary key,
  name          text not null,
  status        text not null default 'active' check (status in ('active', 'inactive')),
  sort_order    int not null default 0
);

-- ──────────────────────────────────────────────────────────────────────────────
-- branches (Stockton, Fresno, Valencia, Riverside, Phoenix, Houston)
-- ──────────────────────────────────────────────────────────────────────────────
create table public.branches (
  key           text primary key,
  name          text not null,
  state         text not null check (state in ('CA', 'AZ', 'TX')),
  status        text not null default 'active' check (status in ('active', 'inactive')),
  sort_order    int not null default 0
);

-- ──────────────────────────────────────────────────────────────────────────────
-- channels (config — defines what each channel tracks and how its cell renders)
-- ──────────────────────────────────────────────────────────────────────────────
create table public.channels (
  id                          uuid primary key default gen_random_uuid(),
  key                         text not null unique,
  name                        text not null,
  owner_id                    uuid references public.users(id) on delete set null,
  owner_label                 text,                          -- display name when owner_id is null
  metrics_schema              jsonb not null,                -- [{ key, label, type: 'count'|'currency' }, ...]
  cell_format                 text not null,                 -- "{install}/{service}"
  quantum_weekly              numeric not null default 0,
  quantum_monthly             numeric not null default 0,
  counts_in_total_sales       boolean not null default false,
  supports_source_breakdown   boolean not null default false,
  sort_order                  int not null default 0,
  created_at                  timestamptz not null default now()
);

-- ──────────────────────────────────────────────────────────────────────────────
-- metrics (the workhorse — actual numbers, weekly or monthly)
-- ──────────────────────────────────────────────────────────────────────────────
create table public.metrics (
  id                  uuid primary key default gen_random_uuid(),
  period_start        date not null,
  period_end          date not null,
  period_type         text not null check (period_type in ('week', 'month')),
  channel_id          uuid not null references public.channels(id) on delete cascade,
  source              text references public.sources(key),
  branch              text references public.branches(key),
  product             text check (product is null or product in ('solar', 'battery', 'hvac', 'roof', 'maintenance')),
  metrics             jsonb not null default '{}'::jsonb,
  source_of_truth     text not null check (source_of_truth in ('jobflo_upload', 'manual_entry')),
  entered_by          uuid references public.users(id) on delete set null,
  entered_at          timestamptz not null default now(),
  notes               text,
  excluded_from_kpi   boolean not null default false,
  check (period_end >= period_start)
);

create index metrics_channel_period_idx
  on public.metrics (channel_id, period_start, period_end);

-- Composite uniqueness — NULLS NOT DISTINCT (PG 15+) treats null = null so a row
-- with no source/branch/product is one bucket, and Supabase upsert can use
-- ON CONFLICT (cols) directly.
create unique index metrics_dedup_uniq
  on public.metrics (channel_id, period_start, source, branch, product, source_of_truth)
  nulls not distinct;

-- ──────────────────────────────────────────────────────────────────────────────
-- forecasts (Phase 2 — owner submissions; same shape as metrics + lock fields)
-- ──────────────────────────────────────────────────────────────────────────────
create table public.forecasts (
  id                  uuid primary key default gen_random_uuid(),
  period_start        date not null,
  period_end          date not null,
  period_type         text not null check (period_type in ('week', 'month')),
  channel_id          uuid not null references public.channels(id) on delete cascade,
  source              text references public.sources(key),
  branch              text references public.branches(key),
  product             text check (product is null or product in ('solar', 'battery', 'hvac', 'roof', 'maintenance')),
  metrics             jsonb not null default '{}'::jsonb,
  submitted_by        uuid references public.users(id) on delete set null,
  submitted_at        timestamptz not null default now(),
  locked_at           timestamptz,
  notes               text,
  check (period_end >= period_start)
);

create index forecasts_channel_period_idx
  on public.forecasts (channel_id, period_start, period_end);

-- ──────────────────────────────────────────────────────────────────────────────
-- prospects (Phase 2 — Inside Sales pipeline)
-- ──────────────────────────────────────────────────────────────────────────────
create table public.prospects (
  id                    uuid primary key default gen_random_uuid(),
  customer_name         text not null,
  contact               jsonb not null default '{}'::jsonb,
  channel_id            uuid references public.channels(id) on delete set null,
  assigned_to           uuid references public.users(id) on delete set null,
  first_contact         date,
  last_contact          date,
  next_callback         date,
  products_interested   text[] not null default '{}'::text[],
  estimated_value       numeric,
  status                text not null default 'active' check (status in ('active', 'dormant', 'closed_won', 'closed_lost')),
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ──────────────────────────────────────────────────────────────────────────────
-- scenarios (Phase 2-3 — forecast tool port; localStorage state moves here)
-- ──────────────────────────────────────────────────────────────────────────────
create table public.scenarios (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  created_by          uuid references public.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  scenario_data       jsonb not null,
  is_active_target    boolean not null default false
);

-- Only one active target at a time (partial unique index)
create unique index scenarios_one_active_target
  on public.scenarios ((true)) where is_active_target;
