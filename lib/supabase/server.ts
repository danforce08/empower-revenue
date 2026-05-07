import { createClient } from '@supabase/supabase-js';

/**
 * Server-side Supabase client. After dropping per-user auth, this just uses
 * the anon key — RLS is disabled in `0005_simplify_auth.sql` so anon has full
 * access. The site is gated by the shared-password cookie at `proxy.ts`.
 */
export async function getSupabaseServer() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}
