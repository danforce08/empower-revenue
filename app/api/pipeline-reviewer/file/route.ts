import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { COOKIE_NAME, verifyToken } from '@/lib/session';
import { getSupabaseServer } from '@/lib/supabase/server';

// Streams back the most recent /upload xlsx so Pipeline Reviewer can parse
// the same data without a second drag-and-drop. Custom headers carry the
// original filename + upload timestamp so the parser can recover AS_OF from
// `customers_YYYY-MM-DD_*.xlsx`.
export const dynamic = 'force-dynamic';

export async function GET() {
  const c = await cookies();
  if (!verifyToken(c.get(COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  const supabase = await getSupabaseServer();

  const { data: list, error: listErr } = await supabase.storage
    .from('jobflo-uploads')
    .list('latest');
  if (listErr) {
    return NextResponse.json({ error: listErr.message }, { status: 500 });
  }
  const file = list?.find((f) => /\.(xlsx|xls|csv)$/i.test(f.name));
  if (!file) {
    return NextResponse.json({ error: 'no_upload' }, { status: 404 });
  }

  const path = `latest/${file.name}`;
  const { data: blob, error: dlErr } = await supabase.storage
    .from('jobflo-uploads')
    .download(path);
  if (dlErr || !blob) {
    return NextResponse.json(
      { error: dlErr?.message ?? 'download failed' },
      { status: 500 },
    );
  }

  const buf = await blob.arrayBuffer();
  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Length': String(buf.byteLength),
      'X-Original-Filename': encodeURIComponent(file.name),
      'X-Uploaded-At': file.created_at ?? file.updated_at ?? '',
      'Cache-Control': 'no-store',
    },
  });
}
