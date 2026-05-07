import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { getSupabaseServer } from '@/lib/supabase/server';
import { COOKIE_NAME, verifyToken } from '@/lib/session';

// GET /api/scenarios → list all forecast snapshots
export async function GET() {
  const c = await cookies();
  if (!verifyToken(c.get(COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from('scenarios')
    .select('id, name, created_at, scenario_data, is_active_target')
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Match the shape the forecast tool expects: { id, name, createdAt, scenario }
  const snapshots = (data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    createdAt: s.created_at,
    scenario: s.scenario_data,
    isActiveTarget: s.is_active_target,
  }));
  return NextResponse.json({ snapshots });
}

// POST /api/scenarios → save a new forecast snapshot
export async function POST(request: NextRequest) {
  const c = await cookies();
  if (!verifyToken(c.get(COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const name = String(body?.name ?? '').trim();
  const scenario = body?.scenario;
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });
  if (!scenario || typeof scenario !== 'object') {
    return NextResponse.json({ error: 'scenario object required' }, { status: 400 });
  }

  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from('scenarios')
    .insert({ name, scenario_data: scenario })
    .select('id, name, created_at, scenario_data, is_active_target')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    snapshot: {
      id: data.id,
      name: data.name,
      createdAt: data.created_at,
      scenario: data.scenario_data,
      isActiveTarget: data.is_active_target,
    },
  });
}
