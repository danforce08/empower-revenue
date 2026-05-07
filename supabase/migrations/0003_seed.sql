-- Empower Revenue Dashboard — seed data
-- Channel metrics_schema + cell_format from spec §4.
-- Quantum allocations sourced from the Quantum sheet (Milestone 1 / Jan-Jun 2026)
-- and rendered as weekly/monthly DEAL targets (installs × 2 for 50% pull-through).

-- ─── sources (Dealer sub-channels) ────────────────────────────────────────────
insert into public.sources (key, name, sort_order) values
  ('empower_x',         'Empower X',          10),
  ('genesis',           'Genesis',            20),
  ('ion',               'Ion',                30),
  ('new_sun',           'New Sun',            40),
  ('pwr_hub',           'Pwr Hub',            50),  -- formerly Sky Power; spec §4 says "Power Hub" but Brain canonical is Pwr Hub
  ('solar_pros',        'Solar Pros',         60),
  ('sunder',            'Sunder Energy',      70),
  ('call_center',       'Call Center',        80),
  ('vk_innovations',    'VK Innovations',     90),
  ('trio',              'Trio Solar Power',  100); -- proposed addition (active dealer per Brain)

-- ─── branches ─────────────────────────────────────────────────────────────────
insert into public.branches (key, name, state, sort_order) values
  ('stockton',  'Stockton',  'CA', 10),
  ('fresno',    'Fresno',    'CA', 20),
  ('valencia',  'Valencia',  'CA', 30),
  ('riverside', 'Riverside', 'CA', 40),
  ('phoenix',   'Phoenix',   'AZ', 50),
  ('houston',   'Houston',   'TX', 60);

-- ─── channels (per spec §4) ───────────────────────────────────────────────────
-- Quantum allocations from the Quantum sheet (gdoc 1FwKT-IpWovD7FLjJA184B2LyoFYrQJz20glObCveNNU),
-- Milestone 1 row (Jan-Jun 2026): take monthly install targets, double for 50%
-- pull-through (deals = installs × 2), divide by 4 weeks.
--   Total Sales — sheet table "M1 Solar & Battery": Install 262 / Sold 523
--     → quantum_monthly = 523, quantum_weekly = 131  (matches spec §5 example)
--   Dealer M1: Solar 125 + Storage 16 = 141 install/mo → 282 sold/mo, 71/wk
--   Internal M1: 42 + 32 = 74 install/mo → 148 sold/mo, 37/wk
--   Inside Sales M1: 10 + 3 = 13 install/mo → 26 sold/mo, 7/wk (Solar+Battery only)
--   IP M1: 31 + 3 = 34 install/mo → 68 sold/mo, 17/wk
--   HVAC: install 40/mo (all channels) → 80 sold/mo, 20/wk
--   Roofing: 66 install/mo (all channels) → 132 sold/mo, 33/wk
insert into public.channels
  (key, name, owner_label, metrics_schema, cell_format, quantum_weekly, quantum_monthly,
   counts_in_total_sales, supports_source_breakdown, sort_order)
values
  ('total_sales', 'Total Sales (Solar+Battery)', 'David Force',
   '[{"key":"accounts","label":"Accounts","type":"count"}]'::jsonb,
   '{accounts}', 131, 523, true, false, 10),

  ('inside_sales', 'Inside Sales', 'Jon Shields',
   '[
      {"key":"apts",         "label":"Appts set",      "type":"count"},
      {"key":"sat",          "label":"Sat",            "type":"count"},
      {"key":"closed_solar", "label":"Closed — Solar", "type":"count"},
      {"key":"closed_hvac",  "label":"Closed — HVAC",  "type":"count"},
      {"key":"closed_roof",  "label":"Closed — Roof",  "type":"count"}
    ]'::jsonb,
   '{apts} apts / {sat} sat / {closed_solar}S / {closed_hvac}H / {closed_roof}R',
   7, 26, false, false, 20),

  ('hvac', 'HVAC', 'Zach Vogl',
   '[
      {"key":"service",            "label":"Service",            "type":"count"},
      {"key":"service_revenue",    "label":"Service rev",        "type":"currency"},
      {"key":"install",            "label":"Install",            "type":"count"},
      {"key":"install_revenue",    "label":"Install rev",        "type":"currency"},
      {"key":"install_collected",  "label":"Install collected",  "type":"currency"},
      {"key":"maintenance_subs",   "label":"Maintenance subs",   "type":"count"},
      {"key":"maintenance_mrr",    "label":"Maintenance MRR",    "type":"currency"}
    ]'::jsonb,
   '{install}/{service}', 20, 80, false, false, 30),

  ('roof', 'Roof', 'Zant Doty',
   '[{"key":"accounts","label":"Accounts","type":"count"}]'::jsonb,
   '{accounts}', 33, 132, false, false, 40),

  ('dealer', 'Dealer', 'Dan Force',
   '[{"key":"accounts","label":"Accounts","type":"count"}]'::jsonb,
   '{accounts}', 71, 282, true, true, 50),

  ('internal', 'Internal', 'Nick Gifford / Quade Foster',
   '[
      {"key":"in_footprint",   "label":"In-footprint",      "type":"count"},
      {"key":"out_footprint",  "label":"Out-of-footprint",  "type":"count"},
      {"key":"az_accounts",    "label":"AZ",                "type":"count"},
      {"key":"ca_accounts",    "label":"CA",                "type":"count"}
    ]'::jsonb,
   '{in_footprint}/{out_footprint}', 37, 148, true, false, 60),

  ('ip', 'IP', 'Brad Morris',
   '[{"key":"accounts","label":"Accounts","type":"count"}]'::jsonb,
   '{accounts}', 17, 68, false, false, 70);

