import Link from 'next/link';
import { getSupabaseServer } from '@/lib/supabase/server';
import {
  isoDate,
  mostRecentSunday,
  parseIsoDate,
  previousWeek,
  weekStart,
} from '@/lib/periods';
import { rollupMetrics } from '@/lib/rollups';
import type { BranchLookup, Channel, MetricRow, SourceLookup } from '@/lib/types';
import { QuickEntryRow } from '@/components/quick-entry-row';
import { RealtimeRefresher } from '@/components/realtime-refresher';

export const dynamic = 'force-dynamic';

type PageProps = { searchParams: Promise<{ week?: string }> };

export default async function EnterPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const weekEndingDate = params.week ? parseIsoDate(params.week) : mostRecentSunday();
  const lastWeek = previousWeek(weekStart(weekEndingDate));
  const lastWeekStartIso = isoDate(lastWeek.start);
  const lastWeekEndIso = isoDate(lastWeek.end);

  const supabase = await getSupabaseServer();
  const [channelsRes, metricsRes, sourcesRes, branchesRes] = await Promise.all([
    supabase.from('channels').select('*').order('sort_order'),
    supabase
      .from('metrics')
      .select('*')
      .gte('period_start', lastWeekStartIso)
      .lte('period_start', lastWeekEndIso),
    supabase.from('sources').select('*').eq('status', 'active').order('sort_order'),
    supabase.from('branches').select('*').eq('status', 'active').order('sort_order'),
  ]);

  const channels = (channelsRes.data ?? []) as Channel[];
  const metrics = (metricsRes.data ?? []) as MetricRow[];
  const sources = (sourcesRes.data ?? []) as SourceLookup[];
  const branches = (branchesRes.data ?? []) as BranchLookup[];

  // Group last-week's metrics by channel (manual entries only — Jobflo uploads
  // shouldn't show as "last entered" since they're auto-imported)
  const byChannel = new Map<string, MetricRow[]>();
  for (const m of metrics) {
    if (m.source_of_truth !== 'manual_entry') continue;
    const arr = byChannel.get(m.channel_id) ?? [];
    arr.push(m);
    byChannel.set(m.channel_id, arr);
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 anim-fade-rise">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--brand-cyan)] font-medium">
          Quick entry
        </p>
        <RealtimeRefresher />
      </div>
      <div className="flex items-end justify-between mb-8 gap-6 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--ink)]">
            Enter last week&apos;s numbers
          </h1>
          <p className="text-sm text-[var(--muted)] mt-1.5">
            Week of <span className="num font-medium text-[var(--foreground)]">{lastWeekStartIso}</span> →{' '}
            <span className="num font-medium text-[var(--foreground)]">{lastWeekEndIso}</span>.
            Saved entries push live to the dashboard so everyone on the call sees them.
          </p>
        </div>
        <Link
          href="/"
          className="text-sm text-[var(--muted)] hover:text-[var(--brand-cyan)] transition-colors"
        >
          ← Back to dashboard
        </Link>
      </div>

      <div className="space-y-3">
        {channels.map((channel, idx) => {
          const channelRows = byChannel.get(channel.id) ?? [];
          const rollup = rollupMetrics(channelRows, channel);
          return (
            <div
              key={channel.id}
              className={`anim-fade-rise stagger-${Math.min(idx, 8)}`}
            >
              <QuickEntryRow
                channel={channel}
                periodStart={isoDate(lastWeek.start)}
                currentRollup={rollup}
                hasManualEntry={channelRows.length > 0}
                sources={sources}
                branches={branches}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
