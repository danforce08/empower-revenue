import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase/server';
import { renderCell } from '@/lib/cell-format';
import { rollupMetrics, sumKey } from '@/lib/rollups';
import { isoDate, mostRecentSunday, weekStart } from '@/lib/periods';
import type { Channel, MetricRow } from '@/lib/types';
import { KindLabel } from '@/components/kind-label';
import { ChannelTrendChart, type TrendPoint } from '@/components/channel-trend-chart';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ id: string }> };

export default async function ChannelDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await getSupabaseServer();

  const today = new Date();
  const wkStart = weekStart(mostRecentSunday(today));
  const earliest = new Date(wkStart);
  earliest.setDate(earliest.getDate() - 56);

  const [channelRes, metricsRes] = await Promise.all([
    supabase.from('channels').select('*').eq('id', id).maybeSingle(),
    supabase
      .from('metrics')
      .select('*')
      .eq('channel_id', id)
      .gte('period_start', isoDate(earliest))
      .order('period_start', { ascending: false }),
  ]);

  const channel = channelRes.data as Channel | null;
  if (!channel) notFound();

  const rows = (metricsRes.data ?? []) as MetricRow[];

  const byWeek = new Map<string, MetricRow[]>();
  for (const r of rows) {
    const arr = byWeek.get(r.period_start) ?? [];
    arr.push(r);
    byWeek.set(r.period_start, arr);
  }
  const weekKeys = Array.from(byWeek.keys()).sort().reverse();

  const latestWeek = weekKeys[0];
  const latestWeekRows = latestWeek ? byWeek.get(latestWeek) ?? [] : [];
  const bySource = groupBy(latestWeekRows, (r) => r.source ?? '—');
  const byBranch = groupBy(latestWeekRows, (r) => r.branch ?? '—');

  // Build the trend chart series — primary metric per week, oldest → newest.
  const primaryKey =
    channel.primary_metric_key ??
    channel.cell_format.match(/\{(\w+)\}/)?.[1] ??
    'accounts';
  const fmtRange = (mondayIso: string) => {
    const m = new Date(mondayIso + 'T00:00:00');
    const s = new Date(m);
    s.setDate(s.getDate() + 6);
    const label = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${label(m)}–${label(s)}`;
  };
  const trendSeries: TrendPoint[] = weekKeys
    .slice()
    .sort()
    .map((wk) => {
      const wkRows = byWeek.get(wk) ?? [];
      const rollup = rollupMetrics(wkRows, channel);
      return { week: wk, value: sumKey(rollup, primaryKey), label: fmtRange(wk) };
    });
  const primaryLabel =
    channel.metrics_schema.find((f) => f.key === primaryKey)?.label ?? primaryKey;

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-8 anim-fade-rise">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <Link href="/" className="text-xs text-[var(--muted)] hover:text-[var(--brand-cyan)] transition-colors">
            ← Back to dashboard
          </Link>
          <div className="flex items-center gap-3 mt-1">
            <h1 className="text-3xl font-semibold tracking-tight text-[var(--ink)]">
              {channel.name}
            </h1>
            <KindLabel kind={channel.kind} />
          </div>
          <p className="text-sm text-[var(--muted)] mt-1.5 num">
            Owner: <span className="text-[var(--foreground)] font-medium">{channel.owner_label ?? '—'}</span>
            <span className="mx-2 text-[var(--border-strong)]">·</span>
            Quantum {channel.quantum_weekly}/wk · {channel.quantum_monthly}/mo
          </p>
        </div>
        <Link
          href={`/channel/${channel.id}/edit`}
          className="btn-primary text-sm font-medium px-4 py-2 rounded-lg"
        >
          Enter numbers
        </Link>
      </div>

      <Section title={`${primaryLabel} trend`}>
        <ChannelTrendChart
          data={trendSeries}
          target={channel.quantum_weekly}
          metricLabel={primaryLabel}
        />
      </Section>

      <Section title="Last 8 weeks">
        {weekKeys.length === 0 ? (
          <Empty>No metrics in the last 8 weeks.</Empty>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[var(--surface-muted)] border-b border-[var(--border)] text-[var(--muted)]">
              <tr>
                <Th>Week</Th>
                {channel.metrics_schema.map((f) => (
                  <Th key={f.key} align="right">{f.label}</Th>
                ))}
                <Th>Cell</Th>
              </tr>
            </thead>
            <tbody>
              {weekKeys.map((wk, idx) => {
                const wkRows = byWeek.get(wk) ?? [];
                const rollup = rollupMetrics(wkRows, channel);
                return (
                  <tr
                    key={wk}
                    className={`row-hover border-b border-[var(--border)] last:border-0 anim-fade-rise stagger-${Math.min(idx, 8)}`}
                  >
                    <Td className="num font-medium text-[var(--ink)]">{wk}</Td>
                    {channel.metrics_schema.map((f) => (
                      <Td key={f.key} align="right" className="num">{sumKey(rollup, f.key)}</Td>
                    ))}
                    <Td className="num text-[var(--muted)]">
                      {renderCell(channel.cell_format, rollup, channel.metrics_schema)}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Section>

      {channel.supports_source_breakdown && (
        <Section title={`Source breakdown · week of ${latestWeek ?? '—'}`}>
          <BreakdownTable channel={channel} grouped={bySource} label="Source" />
        </Section>
      )}

      <Section title={`Branch breakdown · week of ${latestWeek ?? '—'}`}>
        <BreakdownTable channel={channel} grouped={byBranch} label="Branch" />
      </Section>

      <Section title="Notes">
        {latestWeekRows.filter((r) => r.notes).length === 0 ? (
          <Empty>No notes for the most recent week.</Empty>
        ) : (
          <ul className="px-6 py-4 space-y-3 text-sm">
            {latestWeekRows
              .filter((r) => r.notes)
              .map((r) => (
                <li key={r.id} className="border-l-2 border-[var(--brand-cyan)] pl-4">
                  <div className="text-xs text-[var(--muted)] num">
                    {r.period_start} · {r.source ?? '—'} / {r.branch ?? '—'}
                  </div>
                  <div className="text-[var(--foreground)] mt-0.5">{r.notes}</div>
                </li>
              ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function BreakdownTable({
  channel,
  grouped,
  label,
}: {
  channel: Channel;
  grouped: Map<string, MetricRow[]>;
  label: string;
}) {
  const keys = Array.from(grouped.keys()).sort();
  if (keys.length === 0) return <Empty>No rows for this week.</Empty>;
  return (
    <table className="w-full text-sm">
      <thead className="bg-[var(--surface-muted)] border-b border-[var(--border)] text-[var(--muted)]">
        <tr>
          <Th>{label}</Th>
          {channel.metrics_schema.map((f) => (
            <Th key={f.key} align="right">{f.label}</Th>
          ))}
        </tr>
      </thead>
      <tbody>
        {keys.map((k) => {
          const rollup = rollupMetrics(grouped.get(k) ?? [], channel);
          return (
            <tr key={k} className="row-hover border-b border-[var(--border)] last:border-0">
              <Td className="font-medium text-[var(--ink)]">{k}</Td>
              {channel.metrics_schema.map((f) => (
                <Td key={f.key} align="right" className="num">{sumKey(rollup, f.key)}</Td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function groupBy<T>(rows: T[], key: (r: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    const arr = m.get(k) ?? [];
    arr.push(r);
    m.set(k, arr);
  }
  return m;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-medium text-[var(--ink)] mb-3">{title}</h2>
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-x-auto shadow-[0_1px_2px_rgba(10,24,40,0.04)]">
        {children}
      </div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-6 py-8 text-sm text-[var(--muted)]">{children}</div>;
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th className={`px-4 py-3 text-${align} font-medium text-[10px] uppercase tracking-[0.12em]`}>
      {children}
    </th>
  );
}

function Td({
  children,
  align = 'left',
  className = '',
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
  className?: string;
}) {
  return <td className={`px-4 py-3 text-${align} ${className}`}>{children}</td>;
}
