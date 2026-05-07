'use server';

import { cookies } from 'next/headers';
import { getSupabaseServer } from '@/lib/supabase/server';
import { COOKIE_NAME, verifyToken } from '@/lib/session';
import { parseIsoDate, isoDate } from '@/lib/periods';

export type SubmitArgs = {
  channelId: string;
  periodStart: string;       // YYYY-MM-DD (Monday)
  source: string | null;
  branch: string | null;
  product: string | null;
  metrics: Record<string, number>;
  notes: string | null;
  excludedFromKpi: boolean;
};

export async function submitMetric(args: SubmitArgs): Promise<{ error: string | null }> {
  // Validate the shared-password session
  const c = await cookies();
  if (!verifyToken(c.get(COOKIE_NAME)?.value)) {
    return { error: 'Session expired — please sign in again' };
  }

  const supabase = await getSupabaseServer();
  const start = parseIsoDate(args.periodStart);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  // Plain insert — each manual entry is its own row that sums into the
  // weekly/MTD/QTD/YTD rollups. The previous upsert collapsed any two
  // entries with the same (channel, week, source, branch, product) tuple,
  // which made follow-up entries silently overwrite the first.
  const { error } = await supabase.from('metrics').insert({
    channel_id: args.channelId,
    period_start: args.periodStart,
    period_end: isoDate(end),
    period_type: 'week',
    source: args.source,
    branch: args.branch,
    product: args.product,
    metrics: args.metrics,
    source_of_truth: 'manual_entry',
    notes: args.notes,
    excluded_from_kpi: args.excludedFromKpi,
  });
  if (error) return { error: error.message };
  return { error: null };
}
