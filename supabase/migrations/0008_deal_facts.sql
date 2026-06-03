-- 0008_deal_facts.sql
-- Per-account fact table powering the Dashboard's Sold ↔ Installed toggle.
--
-- The aggregated `metrics` buckets key `accounts` by sold week and `installs`
-- by install week independently, so they can't be re-based by the other date
-- or express "sold ∩ installed" cohorts. One row per classified account here
-- carries both dates plus rep/org/branch/utility/ahj/product/clean, so the
-- dashboard can anchor every metric on either date.
--
-- RLS is intentionally left DISABLED for now to match every other public
-- table in this project (the app reads with the anon key until the service-
-- role key lands in Vercel). This table is folded into the upcoming RLS
-- lockdown sweep along with the rest.

create table if not exists public.deal_facts (
  account_id            text primary key,
  rep_name              text,
  dealer_org            text,
  branch                text,
  utility               text,
  ahj                   text,
  sold_date             date not null,
  install_date          date,        -- Install Completed (solar/battery/hvac milestone)
  roof_install_date     date,        -- Roof Install Completed (roof milestone, anchored separately)
  is_solar              boolean not null default false,
  is_battery            boolean not null default false,
  is_roof               boolean not null default false,
  is_hvac               boolean not null default false,
  is_clean              boolean not null default false,
  clean_via_participate boolean not null default false,
  source_of_truth       text not null default 'jobflo_upload',
  updated_at            timestamptz not null default now()
);

create index if not exists deal_facts_sold_date_idx    on public.deal_facts (sold_date);
create index if not exists deal_facts_install_date_idx  on public.deal_facts (install_date);
create index if not exists deal_facts_roof_install_date_idx on public.deal_facts (roof_install_date);
create index if not exists deal_facts_rep_idx           on public.deal_facts (rep_name);
create index if not exists deal_facts_org_idx           on public.deal_facts (dealer_org);
