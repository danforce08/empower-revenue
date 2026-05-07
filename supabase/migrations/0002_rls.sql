-- Empower Revenue Dashboard — RLS policies
-- Per spec §6:
--   * Anyone authenticated reads metrics / forecasts / channels / sources /
--     branches / prospects / users.
--   * Owners write metrics + forecasts only for channels in their users.channels[].
--   * Admins write everything.
--   * users table: only admins can insert/update.
-- The email allowlist (signup gate) is enforced in proxy.ts, not RLS.

-- Helper: is the calling auth.uid() an admin?
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and role = 'admin'
  );
$$;

-- Helper: does the calling auth.uid() own this channel?
create or replace function public.owns_channel(target_channel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid()
      and (target_channel_id = any(channels) or role = 'admin')
  );
$$;

-- Enable RLS on every table
alter table public.users      enable row level security;
alter table public.channels   enable row level security;
alter table public.metrics    enable row level security;
alter table public.forecasts  enable row level security;
alter table public.prospects  enable row level security;
alter table public.scenarios  enable row level security;
alter table public.sources    enable row level security;
alter table public.branches   enable row level security;

-- ─── users ─────────────────────────────────────────────────────────────────────
create policy "users select all authenticated"
  on public.users for select to authenticated using (true);

create policy "users admin write"
  on public.users for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ─── channels ──────────────────────────────────────────────────────────────────
create policy "channels select all authenticated"
  on public.channels for select to authenticated using (true);

create policy "channels admin write"
  on public.channels for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ─── sources ───────────────────────────────────────────────────────────────────
create policy "sources select all authenticated"
  on public.sources for select to authenticated using (true);

create policy "sources admin write"
  on public.sources for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ─── branches ──────────────────────────────────────────────────────────────────
create policy "branches select all authenticated"
  on public.branches for select to authenticated using (true);

create policy "branches admin write"
  on public.branches for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ─── metrics ───────────────────────────────────────────────────────────────────
create policy "metrics select all authenticated"
  on public.metrics for select to authenticated using (true);

create policy "metrics owner insert"
  on public.metrics for insert to authenticated
  with check (public.owns_channel(channel_id));

create policy "metrics owner update"
  on public.metrics for update to authenticated
  using (public.owns_channel(channel_id))
  with check (public.owns_channel(channel_id));

create policy "metrics admin delete"
  on public.metrics for delete to authenticated
  using (public.is_admin());

-- ─── forecasts ────────────────────────────────────────────────────────────────
create policy "forecasts select all authenticated"
  on public.forecasts for select to authenticated using (true);

create policy "forecasts owner insert"
  on public.forecasts for insert to authenticated
  with check (public.owns_channel(channel_id) and locked_at is null);

create policy "forecasts owner update unlocked"
  on public.forecasts for update to authenticated
  using (public.owns_channel(channel_id) and locked_at is null)
  with check (public.owns_channel(channel_id));

create policy "forecasts admin write"
  on public.forecasts for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ─── prospects ────────────────────────────────────────────────────────────────
create policy "prospects select all authenticated"
  on public.prospects for select to authenticated using (true);

create policy "prospects owner write"
  on public.prospects for all to authenticated
  using (public.is_admin() or assigned_to = auth.uid())
  with check (public.is_admin() or assigned_to = auth.uid());

-- ─── scenarios ────────────────────────────────────────────────────────────────
create policy "scenarios select all authenticated"
  on public.scenarios for select to authenticated using (true);

create policy "scenarios admin write"
  on public.scenarios for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
