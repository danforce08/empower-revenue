import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { getSupabaseServer } from '@/lib/supabase/server';
import { COOKIE_NAME, verifyToken } from '@/lib/session';

/**
 * POST /api/scenarios/[id]/activate
 *
 * Marks a scenario as the dashboard's active target (`is_active_target = true`)
 * and clears the flag on every other row so only one is active at a time. The
 * Dashboard reads the active scenario for the Quantum revenue target and the
 * per-install revenue assumption.
 */
export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const c = await cookies();
  if (!verifyToken(c.get(COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }
  const { id } = await ctx.params;
  const supabase = await getSupabaseServer();

  // Two-step: clear all, then set this one. Avoids a transaction; if the
  // second step fails the dashboard simply has no active target until the
  // user retries.
  const { error: clearErr } = await supabase
    .from('scenarios')
    .update({ is_active_target: false })
    .eq('is_active_target', true);
  if (clearErr) return NextResponse.json({ error: clearErr.message }, { status: 500 });

  const { error: setErr } = await supabase
    .from('scenarios')
    .update({ is_active_target: true })
    .eq('id', id);
  if (setErr) return NextResponse.json({ error: setErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
