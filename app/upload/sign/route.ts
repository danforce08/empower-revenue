// Issues a one-time signed upload URL for the jobflo-uploads Storage bucket.
// The browser uploads directly to Storage with the returned token, so the
// public anon role needs no write grant on the bucket — the bucket can stay
// fully private. Gated by the same shared-password session as the rest of the
// app.
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { COOKIE_NAME, verifyToken } from '@/lib/session';
import { getSupabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const BUCKET = 'jobflo-uploads';

export async function POST(req: NextRequest) {
  const c = await cookies();
  if (!verifyToken(c.get(COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const path = body?.path;
  // Defensive: a relative, traversal-free object key only.
  if (typeof path !== 'string' || !path || path.includes('..') || path.startsWith('/')) {
    return NextResponse.json({ error: 'invalid path' }, { status: 400 });
  }

  const supabase = await getSupabaseServer();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(path, { upsert: true });

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? 'could not create signed upload url' },
      { status: 500 },
    );
  }

  return NextResponse.json({ token: data.token, path: data.path });
}
