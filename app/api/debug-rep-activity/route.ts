// TEMPORARY diagnostic — run the Jobflo parser against the latest archived
// upload and dump per-month / per-kind counts of dailyRepActivity. Lets us
// answer "is May missing because the parser drops it, or because the
// upsert drops it?" without needing SQL access. Delete after debugging.
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { COOKIE_NAME, verifyToken } from '@/lib/session';
import { getSupabaseServer } from '@/lib/supabase/server';
import { parseJobfloFile } from '@/lib/jobflo-parser';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET() {
  const c = await cookies();
  if (!verifyToken(c.get(COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  }

  const supabase = await getSupabaseServer();
  const { data: list, error: listErr } = await supabase.storage
    .from('jobflo-uploads')
    .list('latest');
  if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });

  const file = list?.find((f) => /\.(xlsx|xls|csv)$/i.test(f.name));
  if (!file) return NextResponse.json({ error: 'no_upload' }, { status: 404 });

  const path = `latest/${file.name}`;
  const { data: blob, error: dlErr } = await supabase.storage
    .from('jobflo-uploads')
    .download(path);
  if (dlErr || !blob) {
    return NextResponse.json({ error: dlErr?.message ?? 'download failed' }, { status: 500 });
  }

  const buf = await blob.arrayBuffer();
  const parsed = await parseJobfloFile(buf, file.name);

  // Group by (yyyy-mm, kind) -> distinct rep count.
  const byMonth = new Map<string, { sale: Set<string>; install: Set<string>; rows: number }>();
  for (const r of parsed.dailyRepActivity) {
    const month = r.activity_date.slice(0, 7);
    let m = byMonth.get(month);
    if (!m) { m = { sale: new Set(), install: new Set(), rows: 0 }; byMonth.set(month, m); }
    m.rows++;
    if (r.kind === 'sale') m.sale.add(r.rep_name);
    else if (r.kind === 'install') m.install.add(r.rep_name);
  }

  const summary = Array.from(byMonth.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, v]) => ({
      month,
      rows: v.rows,
      sale_distinct_reps: v.sale.size,
      install_distinct_reps: v.install.size,
    }));

  // Spot-check: sample of latest 5 distinct activity_dates and their rep counts.
  const dates = new Map<string, { sale: Set<string>; install: Set<string> }>();
  for (const r of parsed.dailyRepActivity) {
    let d = dates.get(r.activity_date);
    if (!d) { d = { sale: new Set(), install: new Set() }; dates.set(r.activity_date, d); }
    if (r.kind === 'sale') d.sale.add(r.rep_name); else d.install.add(r.rep_name);
  }
  const latestDates = Array.from(dates.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 10)
    .map(([date, v]) => ({ date, sale: v.sale.size, install: v.install.size }));

  // ---- Now query the DB to compare what was actually persisted. ----
  // Fetch in pages of 1000 to escape any default cap; loop until we've
  // pulled everything matching activity_date >= 2026-01-01.
  const dbRows: Array<{ rep_name: string; activity_date: string; kind: string | null }> = [];
  const PAGE = 1000;
  let from = 0;
  for (let i = 0; i < 50; i++) {
    const { data, error } = await supabase
      .from('daily_rep_activity')
      .select('rep_name, activity_date, kind')
      .gte('activity_date', '2026-01-01')
      .order('activity_date', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return NextResponse.json({ error: `db page failed: ${error.message}` }, { status: 500 });
    if (!data || data.length === 0) break;
    dbRows.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  // Same shape as parser-side summary.
  const dbByMonth = new Map<string, { sale: Set<string>; install: Set<string>; nullKind: Set<string>; rows: number }>();
  for (const r of dbRows) {
    const month = r.activity_date.slice(0, 7);
    let m = dbByMonth.get(month);
    if (!m) { m = { sale: new Set(), install: new Set(), nullKind: new Set(), rows: 0 }; dbByMonth.set(month, m); }
    m.rows++;
    if (r.kind === 'sale') m.sale.add(r.rep_name);
    else if (r.kind === 'install') m.install.add(r.rep_name);
    else m.nullKind.add(r.rep_name);
  }
  const dbSummary = Array.from(dbByMonth.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, v]) => ({
      month,
      rows: v.rows,
      sale_distinct_reps: v.sale.size,
      install_distinct_reps: v.install.size,
      null_kind_distinct_reps: v.nullKind.size,
    }));

  return NextResponse.json({
    fileName: file.name,
    rowCount: parsed.rowCount,
    classified: parsed.classified,
    parserDailyRepActivityTotal: parsed.dailyRepActivity.length,
    parserByMonth: summary,
    parserLatestDates: latestDates,
    parserDateRange: parsed.dateMin && parsed.dateMax ? `${parsed.dateMin} → ${parsed.dateMax}` : null,
    dbTotalRowsFetched: dbRows.length,
    dbByMonth: dbSummary,
  });
}
