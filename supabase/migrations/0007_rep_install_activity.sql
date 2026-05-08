-- Adds a `kind` discriminator on daily_rep_activity so we can write both
-- sale-keyed and install-keyed records from a single Jobflo upload.
--
-- The dashboard renders two stacked bar charts off this table — Active
-- Reps by Sale and Active Reps by Install — by filtering on `kind`.
-- Existing rows are flagged 'sale' (the default) so the by-sale chart
-- works against historical data without a re-upload.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'daily_rep_activity'
      and column_name = 'kind'
  ) then
    alter table public.daily_rep_activity
      add column kind text not null default 'sale'
      check (kind in ('sale', 'install'));

    -- Old PK is (rep_name, activity_date). With kind, the same rep can
    -- have both a 'sale' and an 'install' record on the same date.
    if exists (
      select 1 from pg_constraint
      where conrelid = 'public.daily_rep_activity'::regclass
        and contype = 'p'
    ) then
      alter table public.daily_rep_activity
        drop constraint daily_rep_activity_pkey;
    end if;

    alter table public.daily_rep_activity
      add primary key (rep_name, activity_date, kind);
  end if;
end$$;

create index if not exists daily_rep_activity_kind_date_idx
  on public.daily_rep_activity (kind, activity_date);
