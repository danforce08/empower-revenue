import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';

export const maxDuration = 60;

type Row = {
  period: string;       // ISO YYYY-MM-DD (must be the 1st of a month)
  new_reps: number;
  new_dealers: number;
};

/**
 * Receives the monthly recruitment counts derived from the onboarding-sheet
 * Stats tab and upserts them into `public.monthly_recruitment`. Driven by the
 * Wed-morning cloud agent. Replaces the earlier "derive from raw rows"
 * approach so Dan controls the formulas in the spreadsheet.
 *
 * Header: `X-Sync-Token: <SYNC_TOKEN>`
 * Body:   `{ rows: Row[] }`
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

  let body: { rows?: Row[] };
  try {
    body = (await request.json()) as { rows?: Row[] };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, upserted: 0 });
  }

  const supabase = await getSupabaseServer();

  const payload = rows.map((r) => ({
    period: r.period,
    new_reps: Math.max(0, Math.round(r.new_reps ?? 0)),
    new_dealers: Math.max(0, Math.round(r.new_dealers ?? 0)),
    source: 'gsheet_stats',
    synced_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('monthly_recruitment')
    .upsert(payload, { onConflict: 'period', ignoreDuplicates: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, upserted: payload.length });
}
