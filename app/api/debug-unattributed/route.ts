// TEMPORARY diagnostic — emit the rows that pass the parser's "classified"
// gate (so they count toward accounts_created) but have no product flag,
// so they're invisible to /dashboard's 4-product sum. Used to identify
// the gap between the headline number and the all-classified total.
//
// Usage: /api/debug-unattributed?from=2026-05-11&to=2026-05-17
import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { COOKIE_NAME, verifyToken } from '@/lib/session';
import { getSupabaseServer } from '@/lib/supabase/server';
import { findUnattributedRows } from '@/lib/jobflo-parser';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const c = await cookies();
  if (!verifyToken(c.get(COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  }
  const url = new URL(req.url);
  const from = url.searchParams.get('from') ?? '2026-05-11';
  const to = url.searchParams.get('to') ?? '2026-05-17';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: 'bad date format, expected YYYY-MM-DD' }, { status: 400 });
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
  const rows = await findUnattributedRows(buf, from, to);

  return NextResponse.json({
    file: file.name,
    range: { from, to },
    count: rows.length,
    rows,
  });
}
