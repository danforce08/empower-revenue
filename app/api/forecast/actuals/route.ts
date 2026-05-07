import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { getSupabaseServer } from '@/lib/supabase/server';
import { COOKIE_NAME, verifyToken } from '@/lib/session';
import { isoDate, yearStart } from '@/lib/periods';

/**
 * GET /api/forecast/actuals?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Returns YTD-style actuals derived from the site's `metrics` and
 * `daily_rep_activity` tables — the same shape the forecast tool's local
 * file-upload parser used to produce. Replaces the per-tab Jobflo file
 * picker so the forecast page consumes the single site-wide upload.
 *
 * Defaults: from = Jan 1 of current year, to = today.
 */
export async function GET(request: NextRequest) {
  const c = await cookies();
  if (!verifyToken(c.get(COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }
  const url = new URL(request.url);
  const today = new Date();
  const fromIso = url.searchParams.get('from') ?? isoDate(yearStart(today));
  const toIso = url.searchParams.get('to') ?? isoDate(today);

  const supabase = await getSupabaseServer();

  // Pull total_sales channel id, then aggregate solar deals + installs and
  // branch breakdown across the window.
  const { data: channels, error: chErr } = await supabase
    .from('channels')
    .select('id, key');
  if (chErr) return NextResponse.json({ error: chErr.message }, { status: 500 });
  const tsId = channels?.find((c) => c.key === 'total_sales')?.id;
  if (!tsId) {
    return NextResponse.json({ error: 'total_sales channel missing' }, { status: 500 });
  }

  // Bucketed metrics within the window. Use period_end overlap so boundary
  // weeks count once each.
  const { data: rows, error: mErr } = await supabase
    .from('metrics')
    .select('period_start, period_end, branch, metrics, source_of_truth')
    .eq('channel_id', tsId)
    .gte('period_end', fromIso)
    .lte('period_start', toIso);
  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });

  let deals = 0;
  let installs = 0;
  const branchCounts: Record<string, number> = {};
  for (const r of rows ?? []) {
    if (r.source_of_truth !== 'jobflo_upload') continue;
    const m = r.metrics as Record<string, unknown> | null;
    if (!m) continue;
    const a = typeof m.accounts === 'number' ? m.accounts : 0;
    const i = typeof m.installs === 'number' ? m.installs : 0;
    deals += a;
    installs += i;
    if (a > 0 && r.branch) {
      branchCounts[r.branch] = (branchCounts[r.branch] ?? 0) + a;
    }
  }

  // Distinct active reps from the daily activity table.
  const { data: drs, error: drErr } = await supabase
    .from('daily_rep_activity')
    .select('rep_name')
    .gte('activity_date', fromIso)
    .lte('activity_date', toIso);
  if (drErr) return NextResponse.json({ error: drErr.message }, { status: 500 });
  const repSet = new Set<string>();
  for (const r of drs ?? []) repSet.add(r.rep_name);
  const repList = Array.from(repSet).sort();

  const pullThrough = deals > 0 ? (installs / deals) * 100 : null;
  const fromDate = new Date(fromIso + 'T00:00:00');
  const toDate = new Date(toIso + 'T00:00:00');
  const monthsSpanned = Math.max(
    1,
    (toDate.getFullYear() - fromDate.getFullYear()) * 12 +
      (toDate.getMonth() - fromDate.getMonth()) +
      1,
  );

  return NextResponse.json({
    // Same shape the forecast tool's `state.uploadedData` expects so the
    // existing `renderUploadedData()` and `applyFromData()` flows work
    // unchanged.
    fileName: 'Site data (live)',
    rowCount: deals, // approximation — solar accounts only, since the DB
                    // doesn't store raw row counts. Cross-channel volume
                    // is available on the Dashboard.
    deals,
    installs,
    pullThrough,
    repCount: repSet.size,
    repList,
    branchCounts,
    dateMin: fromIso,
    dateMax: toIso,
    dateRange: `${fromIso} → ${toIso}`,
    monthsSpanned,
  });
}
