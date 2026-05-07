import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';

export const maxDuration = 60;

type Event = {
  source?: string;
  rep_first_name?: string | null;
  rep_last_name?: string | null;
  rep_full_name?: string | null;
  rep_email?: string | null;
  dealer_org?: string | null;
  onboarded_date?: string | null; // ISO YYYY-MM-DD
  submitted_at?: string | null;   // ISO YYYY-MM-DD
  access_needed?: string | null;
  raw_row?: Record<string, unknown>;
};

/**
 * Receives a JSON array of onboarding events and upserts them into
 * `public.onboarding_events`. Called by a Brain-side scheduled task each
 * Wednesday morning after pulling the onboarding Google Sheet via the Drive
 * MCP. The route is gated by a shared secret so the cron can authenticate
 * without using a Supabase session.
 *
 * Header: `X-Sync-Token: <SYNC_TOKEN env var>`
 * Body:   `{ events: Event[] }`
 */
export async function POST(request: NextRequest) {
  const token = request.headers.get('x-sync-token');
  const expected = process.env.SYNC_TOKEN;
  if (!expected) {
    return NextResponse.json({ error: 'Server is missing SYNC_TOKEN env var' }, { status: 500 });
  }
  if (!token || token !== expected) {
    return NextResponse.json({ error: 'Bad sync token' }, { status: 401 });
  }

  let body: { events?: Event[] };
  try {
    body = (await request.json()) as { events?: Event[] };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const events = Array.isArray(body.events) ? body.events : [];
  if (events.length === 0) {
    return NextResponse.json({ ok: true, upserted: 0 });
  }

  const supabase = await getSupabaseServer();

  // Default `source` to 'gsheet' so the dedupe index can match.
  const rows = events.map((e) => ({
    source: e.source ?? 'gsheet',
    rep_first_name: e.rep_first_name ?? null,
    rep_last_name: e.rep_last_name ?? null,
    rep_full_name: e.rep_full_name ?? null,
    rep_email: e.rep_email ?? null,
    dealer_org: e.dealer_org ?? null,
    onboarded_date: e.onboarded_date ?? null,
    submitted_at: e.submitted_at ?? null,
    access_needed: e.access_needed ?? null,
    raw_row: e.raw_row ?? null,
    synced_at: new Date().toISOString(),
  }));

  // Insert in chunks so a malformed row doesn't kill the whole batch and so
  // we don't blow PostgREST's request size limit on large pulls.
  const CHUNK = 50;
  let upserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabase
      .from('onboarding_events')
      .upsert(chunk, {
        // Match the unique index dedupe key. Using the index name keeps this
        // resilient to coalesce-shaped key changes.
        onConflict: 'source,rep_email,dealer_org,onboarded_date',
        ignoreDuplicates: false,
      });
    if (error) {
      return NextResponse.json(
        { error: error.message, upsertedSoFar: upserted },
        { status: 500 },
      );
    }
    upserted += chunk.length;
  }

  return NextResponse.json({ ok: true, upserted });
}
