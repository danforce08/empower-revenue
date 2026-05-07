-- Empower Revenue Dashboard — enable Supabase Realtime on the metrics table
-- so the live dashboard refreshes the moment an owner submits numbers
-- (no page reload needed during the weekly revenue call).

alter publication supabase_realtime add table public.metrics;
alter publication supabase_realtime add table public.forecasts;
