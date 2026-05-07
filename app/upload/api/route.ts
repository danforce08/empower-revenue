import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { getSupabaseServer } from '@/lib/supabase/server';
import { COOKIE_NAME, verifyToken } from '@/lib/session';
import { parseJobfloFile, type ChannelKey } from '@/lib/jobflo-parser';

// Larger ceiling — full-history Jobflo exports are ~28k rows × 107 cols and
// the post-parse delete/insert burst is the slowest leg.
export const maxDuration = 300;

// Channel keys this upload writes into. Each row in Jobflo is classified by
// the parser into one or both of these channels.
const TARGET_CHANNEL_KEYS: ChannelKey[] = ['total_sales', 'roof', 'battery_only', 'internal', 'dealer', 'hvac'];

// Branches we drop on sight (e.g., Jobflo's leftover QA branch).
const SKIP_BRANCHES = new Set(['test']);

export async function POST(request: NextRequest) {
  const c = await cookies();
  if (!verifyToken(c.get(COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  const supabase = await getSupabaseServer();

  // Two intake paths:
  //   1) JSON `{ supabasePath, fileName }` — large files uploaded direct to
  //      Supabase Storage from the browser. Default path; bypasses the 4.5MB
  //      function body limit.
  //   2) multipart form `file` — small files posted directly. Kept for CLI /
  //      curl convenience.
  const contentType = request.headers.get('content-type') ?? '';
  let buffer: ArrayBuffer;
  let fileName: string;

  if (contentType.includes('application/json')) {
    const { supabasePath, fileName: name } = (await request.json()) as {
      supabasePath?: string;
      fileName?: string;
    };
    if (!supabasePath) {
      return NextResponse.json({ error: 'No supabasePath provided' }, { status: 400 });
    }
    const dl = await supabase.storage.from('jobflo-uploads').download(supabasePath);
    if (dl.error || !dl.data) {
      return NextResponse.json(
        { error: `Failed to download upload: ${dl.error?.message ?? 'unknown'}` },
        { status: 400 },
      );
    }
    buffer = await dl.data.arrayBuffer();
    fileName = name ?? supabasePath.split('/').pop() ?? 'upload.xlsx';
    // Best-effort cleanup so the bucket doesn't accumulate. Errors are logged
    // but don't fail the request.
    void supabase.storage.from('jobflo-uploads').remove([supabasePath]);
  } else {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }
    buffer = await file.arrayBuffer();
    fileName = file.name;
  }

  let parsed;
  try {
    parsed = await parseJobfloFile(buffer, fileName);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to parse file';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const buckets = parsed.buckets.filter(
    (b) => !b.branch || !SKIP_BRANCHES.has(b.branch.toLowerCase().trim()),
  );
  const skippedCount = parsed.buckets.length - buckets.length;

  if (buckets.length === 0) {
    return NextResponse.json(
      { error: 'No bucketable rows found (need a sale-date column)', warnings: parsed.warnings },
      { status: 400 },
    );
  }

  // Resolve channel ids
  const { data: channelsData, error: channelsError } = await supabase
    .from('channels')
    .select('id, key')
    .in('key', TARGET_CHANNEL_KEYS);
  if (channelsError) {
    return NextResponse.json({ error: channelsError.message }, { status: 500 });
  }
  const channelIdByKey = new Map<ChannelKey, string>();
  for (const c of channelsData ?? []) {
    if (TARGET_CHANNEL_KEYS.includes(c.key as ChannelKey)) {
      channelIdByKey.set(c.key as ChannelKey, c.id as string);
    }
  }

  // Branch lookup (case-insensitive name → key)
  const { data: branchesData } = await supabase.from('branches').select('key, name');
  const branchKeyByName = new Map(
    (branchesData ?? []).map((b) => [b.name.toLowerCase().trim(), b.key as string]),
  );

  // Affected period_starts per channel — for the cleanup DELETE
  const affectedByChannel = new Map<ChannelKey, Set<string>>();
  for (const b of buckets) {
    const set = affectedByChannel.get(b.channelKey) ?? new Set<string>();
    set.add(b.weekStart);
    affectedByChannel.set(b.channelKey, set);
  }

  // Delete prior jobflo_upload rows for the affected (channel, weeks)
  for (const [channelKey, weeksSet] of affectedByChannel) {
    const channelId = channelIdByKey.get(channelKey);
    if (!channelId) continue;
    const { error: delErr } = await supabase
      .from('metrics')
      .delete()
      .eq('channel_id', channelId)
      .in('period_start', Array.from(weeksSet))
      .eq('source_of_truth', 'jobflo_upload');
    if (delErr) {
      return NextResponse.json(
        { error: `Cleanup failed (${channelKey}): ${delErr.message}` },
        { status: 500 },
      );
    }
  }

  // Build new metric rows
  const newRows: Array<Record<string, unknown>> = [];
  for (const bucket of buckets) {
    const channelId = channelIdByKey.get(bucket.channelKey);
    if (!channelId) continue;
    const branchKey = bucket.branch
      ? branchKeyByName.get(bucket.branch.toLowerCase().trim()) ?? null
      : null;
    newRows.push({
      channel_id: channelId,
      period_start: bucket.weekStart,
      period_end: bucket.weekEnd,
      period_type: 'week',
      source: null,
      branch: branchKey,
      product: null,
      metrics: bucket.metrics,
      source_of_truth: 'jobflo_upload',
    });
  }

  const { error: insErr } = await supabase.from('metrics').insert(newRows);
  if (insErr) {
    return NextResponse.json({ error: `Insert failed: ${insErr.message}` }, { status: 500 });
  }

  // Refresh daily_rep_activity from this upload. Wipe the date range covered
  // by the current parse and re-insert so re-uploads stay idempotent.
  const dailyRows = parsed.dailyRepActivity ?? [];
  if (dailyRows.length > 0) {
    const minDate = dailyRows.reduce((m, r) => (r.activity_date < m ? r.activity_date : m), dailyRows[0].activity_date);
    const maxDate = dailyRows.reduce((m, r) => (r.activity_date > m ? r.activity_date : m), dailyRows[0].activity_date);
    const { error: delDailyErr } = await supabase
      .from('daily_rep_activity')
      .delete()
      .gte('activity_date', minDate)
      .lte('activity_date', maxDate);
    if (delDailyErr) {
      // Soft-fail — historical reads still work, just with stale data
      console.warn('[upload] daily_rep_activity cleanup failed:', delDailyErr.message);
    }
    // Chunk inserts to keep request size sane.
    const CHUNK = 500;
    for (let i = 0; i < dailyRows.length; i += CHUNK) {
      const chunk = dailyRows.slice(i, i + CHUNK);
      const { error: drErr } = await supabase.from('daily_rep_activity').upsert(chunk, {
        onConflict: 'rep_name,activity_date',
        ignoreDuplicates: false,
      });
      if (drErr) {
        console.warn('[upload] daily_rep_activity insert chunk failed:', drErr.message);
        break;
      }
    }
  }

  const warnings = [...parsed.warnings];
  if (skippedCount > 0) warnings.push(`Skipped ${skippedCount} test/QA branch buckets`);

  // Per-channel summary
  const perChannel: Record<string, { weeks: number; rows: number }> = {};
  for (const [channelKey, weeksSet] of affectedByChannel) {
    perChannel[channelKey] = {
      weeks: weeksSet.size,
      rows: buckets.filter((b) => b.channelKey === channelKey).length,
    };
  }

  return NextResponse.json({
    rowCount: parsed.rowCount,
    classified: parsed.classified,
    perChannel,
    weeksCovered: Array.from(new Set(buckets.map((b) => b.weekStart))).length,
    channelsAffected: Object.keys(perChannel).length,
    dateRange: parsed.dateMin && parsed.dateMax ? `${parsed.dateMin} → ${parsed.dateMax}` : null,
    branchesSeen: parsed.branchesSeen.filter((b) => b.toLowerCase() !== 'test'),
    warnings,
  });
}
