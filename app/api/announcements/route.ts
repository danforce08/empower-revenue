import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { getSupabaseServer } from '@/lib/supabase/server';
import { COOKIE_NAME, verifyToken } from '@/lib/session';

const MAX_BODY_BYTES = 100_000; // ~100 KB ceiling — announcements should never grow this big

export async function GET() {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from('announcements')
    .select('body')
    .eq('id', 1)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ body: data?.body ?? '' });
}

export async function POST(request: NextRequest) {
  const c = await cookies();
  if (!verifyToken(c.get(COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  const json = (await request.json().catch(() => null)) as { body?: unknown } | null;
  if (!json || typeof json.body !== 'string') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  if (json.body.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Announcements too long' }, { status: 400 });
  }

  const supabase = await getSupabaseServer();
  const { error } = await supabase
    .from('announcements')
    .update({ body: json.body, updated_at: new Date().toISOString() })
    .eq('id', 1);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
