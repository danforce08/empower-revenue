-- Empower Revenue Dashboard — drop per-user auth, switch to shared password.
-- All RLS policies removed since the team shares one trust boundary; the site
-- is gated at the app layer (proxy.ts) by an HMAC-signed cookie tied to a
-- single APP_PASSWORD env var.

-- Drop existing per-user RLS policies (created in 0002_rls.sql)
drop policy if exists "users select all authenticated" on public.users;
drop policy if exists "users admin write"             on public.users;
drop policy if exists "channels select all authenticated"  on public.channels;
drop policy if exists "channels admin write"               on public.channels;
drop policy if exists "sources select all authenticated"   on public.sources;
drop policy if exists "sources admin write"                on public.sources;
drop policy if exists "branches select all authenticated"  on public.branches;
drop policy if exists "branches admin write"               on public.branches;
drop policy if exists "metrics select all authenticated"   on public.metrics;
drop policy if exists "metrics owner insert"               on public.metrics;
drop policy if exists "metrics owner update"               on public.metrics;
drop policy if exists "metrics admin delete"               on public.metrics;
drop policy if exists "forecasts select all authenticated"     on public.forecasts;
drop policy if exists "forecasts owner insert"                 on public.forecasts;
drop policy if exists "forecasts owner update unlocked"        on public.forecasts;
drop policy if exists "forecasts admin write"                  on public.forecasts;
drop policy if exists "prospects select all authenticated"     on public.prospects;
drop policy if exists "prospects owner write"                  on public.prospects;
drop policy if exists "scenarios select all authenticated"     on public.scenarios;
drop policy if exists "scenarios admin write"                  on public.scenarios;

-- Disable RLS — anon role gets full access. (Trust boundary is the cookie gate.)
alter table public.channels  disable row level security;
alter table public.metrics   disable row level security;
alter table public.forecasts disable row level security;
alter table public.prospects disable row level security;
alter table public.scenarios disable row level security;
alter table public.sources   disable row level security;
alter table public.branches  disable row level security;

-- Drop helper functions tied to auth.uid()
drop function if exists public.is_admin();
drop function if exists public.owns_channel(uuid);

-- Drop public.users entirely. CASCADE removes the FK constraints in metrics /
-- forecasts / prospects / scenarios / channels — those columns stay (uuid, nullable).
drop table if exists public.users cascade;
