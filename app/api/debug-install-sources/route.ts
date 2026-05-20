// TEMPORARY — broad scan of every install-related date column in the
// Customers sheet plus a sniff of other sheets. Used to chase the gap
// between Jobflo's "82 installs MTD" and the xlsx's "75 install
// completed dates in May 1-20" — i.e., find what Jobflo is counting
// that we're missing.
//
// Usage: /api/debug-install-sources?from=2026-05-01&to=2026-05-20
import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { COOKIE_NAME, verifyToken } from '@/lib/session';
import { getSupabaseServer } from '@/lib/supabase/server';
import { scanInstallSources } from '@/lib/jobflo-parser';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const c = await cookies();
  if (!verifyToken(c.get(COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  }
  const url = new URL(req.url);
  const from = url.searchParams.get('from') ?? '2026-05-01';
  const to = url.searchParams.get('to') ?? '2026-05-20';

  const supabase = await getSupabaseServer();
  const { data: list, error: listErr } = await supabase.storage
    .from('jobflo-uploads')
    .list('latest');
  if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });
  const file = list?.find((f) => /\.(xlsx|xls|csv)$/i.test(f.name));
  if (!file) return NextResponse.json({ error: 'no_upload' }, { status: 404 });

  const { data: blob, error: dlErr } = await supabase.storage
    .from('jobflo-uploads')
    .download(`latest/${file.name}`);
  if (dlErr || !blob) {
    return NextResponse.json({ error: dlErr?.message ?? 'download failed' }, { status: 500 });
  }
  const buf = await blob.arrayBuffer();
  const result = await scanInstallSources(buf, from, to);
  return NextResponse.json({ file: file.name, range: { from, to }, ...result });
}
