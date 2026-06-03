import { createClient } from '@supabase/supabase-js';

/**
 * Server-side Supabase client.
 *
 * Prefers the SERVICE ROLE key (a server-only env var — never NEXT_PUBLIC, so
 * it is never shipped to the browser). The service role bypasses RLS, so the
 * app keeps full read/write while RLS denies the public `anon` role on every
 * table. That closes the hole where the browser-exposed anon key could read
 * customer PII directly through PostgREST, bypassing the password gate.
 *
 * Falls back to the anon key when the service role key isn't set yet, so the
 * app keeps working during rollout (before the env var is added and before
 * RLS is enabled). Once the service role key is live in every environment,
 * RLS can be turned on safely.
 */
export async function getSupabaseServer() {
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
