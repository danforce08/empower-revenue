import Link from 'next/link';
import { getSupabaseServer } from '@/lib/supabase/server';
import { getAnnouncementsBody } from '@/lib/announcements';
import {
  isoDate,
  monthStart,
  mostRecentSunday,
  parseIsoDate,
  previousWeek,
  quarterStart,
  weekStart,
  yearStart,
} from '@/lib/periods';
import { renderCell, formatCount } from '@/lib/cell-format';
import { rollupMetrics, rollupMetricsProrated, rowsInRange } from '@/lib/rollups';
import type { Channel, MetricRow, MetricSchemaField } from '@/lib/types';
import { AnnouncementsEditor } from '@/components/announcements-editor';
import { RealtimeRefresher } from '@/components/realtime-refresher';
import { KindLabel } from '@/components/kind-label';
import { WeekPicker } from '@/components/week-picker';
import { CountUp } from '@/components/count-up';

export const dynamic = 'force-dynamic';

type PageProps = { searchParams: Promise<{ week?: string }> };

export default async function HomePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const weekEndingDate = params.week ? parseIsoDate(params.week) : mostRecentSunday();
  const weekStarting = weekStart(weekEndingDate);
  const lastWeek = previousWeek(weekStarting);
  const mtdStart = monthStart(weekEndingDate);
  const qtdStart = quarterStart(weekEndingDate);
  const ytdStart = yearStart(weekEndingDate);

  // Trend window goes back 8 weeks from last week's start. The fetch range
  // must cover the EARLIEST of trend start / YTD start / last week start so
  // sparklines and YTD aren't silently truncated.
  const trendStart = new Date(lastWeek.start);
  trendStart.setDate(trendStart.getDate() - 7 * 7);
  const rangeStart = [trendStart, ytdStart, lastWeek.start].reduce(
    (a, b) => (a < b ? a : b),
  );

  const supabase = await getSupabaseServer();
  const [channelsRes, metricsRes, announcementsBody] = await Promise.all([
    supabase.from('channels').select('*').order('sort_order'),
    supabase
      .from('metrics')
      .select('*')
      .gte('period_end', isoDate(rangeStart))
      .lte('period_start', isoDate(weekEndingDate)),
    getAnnouncementsBody(),
  ]);

  const channels = (channelsRes.data ?? []) as Channel[];
  const metrics = (metricsRes.data ?? []) as MetricRow[];

  const byChannel = new Map<string, MetricRow[]>();
  for (const m of metrics) {
    const arr = byChannel.get(m.channel_id);
    if (arr) arr.push(m);
    else byChannel.set(m.channel_id, [m]);
  }

  const lastWeekStartIso = isoDate(lastWeek.start);
  const lastWeekEndIso = isoDate(lastWeek.end);
  const mtdStartIso = isoDate(mtdStart);
  const qtdStartIso = isoDate(qtdStart);
  const ytdStartIso = isoDate(ytdStart);
  const weekEndingIso = isoDate(weekEndingDate);

  const rows = channels.map((channel) => {
    const channelMetrics = byChannel.get(channel.id) ?? [];
    const lastWeekRollup = rollupMetrics(
      rowsInRange(channelMetrics, lastWeekStartIso, lastWeekEndIso),
      channel,
    );
    const mtdRollup = rollupMetricsProrated(
      rowsInRange(channelMetrics, mtdStartIso, weekEndingIso),
      channel,
      mtdStartIso,
      weekEndingIso,
    );
    const qtdRollup = rollupMetricsProrated(
      rowsInRange(channelMetrics, qtdStartIso, weekEndingIso),
      channel,
      qtdStartIso,
      weekEndingIso,
    );
    const ytdRollup = rollupMetricsProrated(
      rowsInRange(channelMetrics, ytdStartIso, weekEndingIso),
      channel,
      ytdStartIso,
      weekEndingIso,
    );
    const lastEntered = channelMetrics
      .map((r) => r.entered_at)
      .sort()
      .at(-1) ?? null;

    // 8-week history of the primary count for the trend sparkline
    const trend: number[] = [];
    const cursor = new Date(trendStart);
    for (let i = 0; i < 8; i++) {
      const wkS = isoDate(cursor);
      const wkEnd = new Date(cursor);
      wkEnd.setDate(wkEnd.getDate() + 6);
      const wkRollup = rollupMetrics(
        rowsInRange(channelMetrics, wkS, isoDate(wkEnd)),
        channel,
      );
      trend.push(primaryCountLoose(channel, wkRollup));
      cursor.setDate(cursor.getDate() + 7);
    }

    return { channel, lastWeekRollup, mtdRollup, qtdRollup, ytdRollup, lastEntered, trend };
  });

  // Product-category roll-ups for the footer.
  const solarStorageRow = rows.find((r) => r.channel.key === 'total_sales');
  const roofingRow = rows.find((r) => r.channel.key === 'roof');
  const batteryOnlyRow = rows.find((r) => r.channel.key === 'battery_only');
  const hvacRow = rows.find((r) => r.channel.key === 'hvac');

  const solarStorageActual = solarStorageRow
    ? primaryCount(solarStorageRow.channel, solarStorageRow.lastWeekRollup) ?? 0
    : 0;
  const solarStorageTarget = solarStorageRow?.channel.quantum_weekly ?? 0;

  const roofingActual = roofingRow
    ? primaryCount(roofingRow.channel, roofingRow.lastWeekRollup) ?? 0
    : 0;
  const roofingTarget = roofingRow?.channel.quantum_weekly ?? 0;

  const batteryOnlyActual = batteryOnlyRow
    ? primaryCount(batteryOnlyRow.channel, batteryOnlyRow.lastWeekRollup) ?? 0
    : 0;
  const batteryOnlyTarget = batteryOnlyRow?.channel.quantum_weekly ?? 0;

  // HVAC's cell_format is multi-key so primaryCount() returns null. Pick the
  // `install` count directly — that's what HVAC's quantum_weekly target tracks.
  const hvacActual = hvacRow ? numFromRollup(hvacRow.lastWeekRollup, 'install') : 0;
  const hvacTarget = hvacRow?.channel.quantum_weekly ?? 0;


  const hasData = metrics.length > 0;

  // Split entities by kind so the Quantum strip can group them visually and
  // the channel breakdown table can show only sales channels.
  const productRows = rows.filter((r) => r.channel.kind === 'product');
  const channelRows = rows.filter((r) => r.channel.kind === 'channel');

  // Submission status — count channels with a metric row in last week's window
  const submittedThisWeek = channelRows.filter((r) =>
    r.lastEntered && r.lastEntered >= lastWeek.start.toISOString(),
  ).length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      {/* Hero */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-10 anim-fade-rise">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--brand-cyan)] font-medium">
              Weekly Review
            </p>
            <RealtimeRefresher />
          </div>
          <h1 className="text-2xl sm:text-4xl font-semibold tracking-tight text-[var(--ink)]">
            Weekly meeting view
          </h1>
          <p className="text-sm text-[var(--muted)] mt-2">
            Week ending <span className="num font-medium text-[var(--foreground)]">{weekEndingIso}</span>
          </p>
        </div>
        <WeekPicker
          current={weekEndingIso}
          options={buildWeekOptions(weekEndingDate, 26)}
        />
      </div>

      {/* Announcements — inline editable, persisted to Supabase. */}
      <AnnouncementsEditor initialBody={announcementsBody} />


      {/* Product-category roll-ups — the headline view */}
      <section className="mb-10 anim-fade-rise stagger-1">
        <div className="flex items-center gap-2 mb-3">
          <KindLabel kind="product" />
          <h2 className="text-xs uppercase tracking-[0.14em] font-semibold text-[var(--ink)]">
            Last week scoreboard
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 lg:grid-rows-2 gap-4 lg:auto-rows-fr">
          <TotalCard
            label="Solar + Storage"
            subtitle="Solar w/ or w/o attached battery"
            actual={solarStorageActual}
            target={solarStorageTarget}
            gap={solarStorageActual - solarStorageTarget}
            accent="navy"
            hero
          />
          <TotalCard
            label="Battery Only"
            subtitle="Standalone battery"
            actual={batteryOnlyActual}
            target={batteryOnlyTarget}
            gap={batteryOnlyActual - batteryOnlyTarget}
            accent="cyan"
          />
          <TotalCard
            label="Roofing"
            subtitle="Roof-only + roof attached to solar"
            actual={roofingActual}
            target={roofingTarget}
            gap={roofingActual - roofingTarget}
            accent="cyan"
          />
          <TotalCard
            label="HVAC"
            subtitle="New installs (service tracked separately)"
            actual={hvacActual}
            target={hvacTarget}
            gap={hvacActual - hvacTarget}
            accent="navy"
          />
          <TotalCard
            label="All products combined"
            subtitle="Sum across the four product categories above"
            actual={solarStorageActual + batteryOnlyActual + roofingActual + hvacActual}
            target={solarStorageTarget + batteryOnlyTarget + roofingTarget + hvacTarget}
            gap={
              (solarStorageActual + batteryOnlyActual + roofingActual + hvacActual) -
              (solarStorageTarget + batteryOnlyTarget + roofingTarget + hvacTarget)
            }
            accent="navy"
          />
        </div>
      </section>

      {/* Channel table */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden shadow-[0_1px_2px_rgba(10,24,40,0.04),0_8px_24px_-12px_rgba(10,24,40,0.08)]">
        <div className="px-6 py-4 border-b border-[var(--border)] flex items-center gap-3 flex-wrap">
          <h2 className="text-sm font-medium text-[var(--ink)]">By channel</h2>
          <span className="chip bg-[var(--surface-muted)] text-[var(--muted)] num">
            {submittedThisWeek}/{channelRows.length} submitted
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[var(--surface-muted)] text-[var(--muted)] border-b border-[var(--border)]">
              <tr>
                <Th></Th>
                <Th>KPI Owner</Th>
                <Th>Channel</Th>
                <Th>Last Week</Th>
                <Th>Trend (8w)</Th>
                <Th>MTD</Th>
                <Th>QTD</Th>
                <Th>YTD</Th>
                <Th align="right">Quantum (W / M)</Th>
              </tr>
            </thead>
            <tbody>
              {channelRows.map(({ channel, lastWeekRollup, mtdRollup, qtdRollup, ytdRollup, lastEntered, trend }, idx) => {
                const primary = primaryCount(channel, lastWeekRollup) ?? numFromRollup(lastWeekRollup, 'install');
                const target = channel.quantum_weekly;
                const status: 'ok' | 'warn' | 'bad' | 'neutral' =
                  !target ? 'neutral' :
                  primary >= target ? 'ok' :
                  primary >= target * 0.5 ? 'warn' : 'bad';
                const statusBar =
                  status === 'ok' ? 'bg-emerald-400' :
                  status === 'warn' ? 'bg-amber-400' :
                  status === 'bad' ? 'bg-rose-400' :
                  'bg-[var(--border)]';
                const pct = target ? Math.min(100, Math.round((primary / target) * 100)) : 0;
                return (
                  <tr
                    key={channel.id}
                    className={`group/row row-hover border-b border-[var(--border)] last:border-0 anim-fade-rise stagger-${Math.min(idx, 8)}`}
                  >
                    <Td className="!px-0 !py-0 w-1">
                      <div className={`w-1 ${statusBar} h-full min-h-[64px]`} />
                    </Td>
                    <Td className="text-[var(--ink)] font-medium">{channel.owner_label ?? '—'}</Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/channel/${channel.id}`}
                          className="text-[var(--foreground)] hover:text-[var(--brand-cyan)] transition-colors font-medium"
                        >
                          {channel.name}
                        </Link>
                        <Link
                          href={`/channel/${channel.id}/edit`}
                          aria-label={`Enter numbers for ${channel.name}`}
                          className="opacity-0 group-hover/row:opacity-100 hover:bg-[var(--brand-cyan-soft)] text-[var(--ink)] rounded-md px-1.5 py-0.5 text-xs transition-opacity"
                          title="Quick enter"
                        >
                          + enter
                        </Link>
                        {lastEntered && <FreshChip ts={lastEntered} />}
                      </div>
                    </Td>
                    <Td>
                      <BigLastWeekCell
                        channel={channel}
                        rollup={lastWeekRollup}
                        target={target}
                      />
                    </Td>
                    <Td>
                      <Sparkline values={trend} status={status} />
                    </Td>
                    <Td className="num text-[var(--foreground)]">
                      {renderCell(channel.cell_format, mtdRollup, channel.metrics_schema)}
                    </Td>
                    <Td className="num text-[var(--foreground)]">
                      {renderCell(channel.cell_format, qtdRollup, channel.metrics_schema)}
                    </Td>
                    <Td className="num text-[var(--foreground)]">
                      {renderCell(channel.cell_format, ytdRollup, channel.metrics_schema)}
                    </Td>
                    <Td align="right" className="num">
                      <div className="text-sm">
                        <span className="text-[var(--ink)] font-semibold">{formatCount(channel.quantum_weekly)}</span>
                        <span className="mx-1.5 text-[var(--border-strong)]">/</span>
                        <span className="text-[var(--muted)]">{formatCount(channel.quantum_monthly)}</span>
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Empty-state hint when no metrics yet */}
      {!hasData && (
        <div className="mt-6 rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface)] p-6 anim-fade-in stagger-3">
          <h3 className="text-sm font-medium text-[var(--ink)]">No data yet</h3>
          <p className="text-sm text-[var(--muted)] mt-1">
            All cells will read <span className="font-mono">—</span> until owners enter their numbers
            or you upload a Jobflo export.
          </p>
          <div className="flex gap-3 mt-4">
            <Link href="/upload" className="btn-primary text-sm font-medium px-4 py-2 rounded-lg">
              Upload Jobflo file
            </Link>
            <Link
              href={`/channel/${channels[0]?.id ?? ''}/edit`}
              className="btn-ghost text-sm font-medium px-4 py-2 rounded-lg border border-[var(--border)]"
            >
              Enter numbers manually
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

/* ───── helpers ───── */

function numFromRollup(
  rollup: Record<string, number | string[]>,
  key: string,
): number {
  const v = rollup[key];
  return typeof v === 'number' ? v : 0;
}

function primaryCountField(channel: Channel): MetricSchemaField | null {
  // Prefer the explicit DB-configured primary_metric_key
  if (channel.primary_metric_key) {
    const explicit = channel.metrics_schema.find(
      (f) => f.key === channel.primary_metric_key && f.type === 'count',
    );
    if (explicit) return explicit;
  }
  // Fall back to single-token cell_format
  const m = channel.cell_format.match(/^\{(\w+)\}$/);
  if (!m) return null;
  return channel.metrics_schema.find((f) => f.key === m[1] && f.type === 'count') ?? null;
}

function primaryCount(
  channel: Channel,
  rollup: Record<string, number | string[]>,
): number | null {
  const field = primaryCountField(channel);
  if (!field) return null;
  const v = rollup[field.key];
  return typeof v === 'number' ? v : 0;
}

/**
 * Looser variant for trend lines / product cards: uses the FIRST count-typed
 * metric referenced in cell_format (even if cell_format is multi-key like
 * `{install}/{service}` or `{in_footprint}/{out_footprint}`). Returns 0 if no
 * usable count metric is found.
 */
function primaryCountLoose(
  channel: Channel,
  rollup: Record<string, number | string[]>,
): number {
  const pick = (key: string): number => {
    const v = rollup[key];
    return typeof v === 'number' ? v : 0;
  };
  const m = channel.cell_format.match(/\{(\w+)\}/);
  if (m) {
    const f = channel.metrics_schema.find((x) => x.key === m[1] && x.type === 'count');
    if (f) return pick(f.key);
  }
  const firstCount = channel.metrics_schema.find((f) => f.type === 'count');
  return firstCount ? pick(firstCount.key) : 0;
}

function QuantumGroup({
  title,
  kind,
  rows,
}: {
  title: string;
  kind: 'product' | 'channel';
  rows: Array<{ channel: Channel; lastWeekRollup: Record<string, number | string[]> }>;
}) {
  if (rows.length === 0) return null;
  return (
    <div>
      <div className="flex items-center gap-2 mb-2.5">
        <KindLabel kind={kind} />
        <h3 className="text-xs uppercase tracking-[0.14em] font-semibold text-[var(--ink)]">
          {title}
        </h3>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        {rows.map(({ channel, lastWeekRollup }, idx) => {
          const primary =
            primaryCount(channel, lastWeekRollup) ?? numFromRollup(lastWeekRollup, 'install');
          const onTrack = !channel.quantum_weekly || primary >= channel.quantum_weekly;
          return (
            <Link
              key={channel.id}
              href={`/channel/${channel.id}`}
              className={`group relative bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 transition-all duration-200 hover:border-[var(--brand-cyan)] hover:shadow-[0_2px_4px_rgba(10,24,40,0.04),0_12px_24px_-12px_rgba(10,24,40,0.18)] hover:-translate-y-0.5 anim-fade-rise stagger-${Math.min(idx, 8)}`}
            >
              <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--muted)] truncate">
                {channel.name}
              </div>
              <div className="mt-2 flex items-baseline gap-1.5 num">
                <span className="text-2xl font-semibold tracking-tight text-[var(--ink)]">
                  {channel.quantum_weekly}
                </span>
                <span className="text-xs text-[var(--muted)]">/wk</span>
              </div>
              <div className="text-xs text-[var(--muted)] num mt-0.5">
                {channel.quantum_monthly} / mo
              </div>
              {channel.quantum_weekly > 0 && (
                <div className="mt-3 flex items-center justify-between text-[11px] num">
                  <span className="text-[var(--muted)]">last wk</span>
                  <span className={onTrack ? 'text-emerald-700 font-medium' : 'text-rose-700 font-medium'}>
                    {primary} {onTrack ? '✓' : `· -${channel.quantum_weekly - primary}`}
                  </span>
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function BatteryOnlyPlaceholderCard() {
  return (
    <div className="relative rounded-2xl bg-[var(--surface)] border border-dashed border-[var(--border-strong)] p-6 overflow-hidden">
      <div className="flex items-baseline justify-between">
        <div>
          <h2 className="text-sm font-medium text-[var(--ink)]">Battery Only</h2>
          <p className="text-xs text-[var(--muted)] mt-0.5">Standalone battery (no solar attached)</p>
        </div>
        <span className="chip bg-[var(--surface-muted)] text-[var(--muted)]">tbd</span>
      </div>
      <div className="mt-5 flex items-end justify-between">
        <div className="flex items-baseline gap-2 num text-[var(--muted)]">
          <span className="text-4xl font-semibold tracking-tight">—</span>
          <span className="text-sm">/ —</span>
        </div>
        <span className="text-[11px] text-[var(--muted)] max-w-[55%] text-right leading-snug">
          Wire up after Adders cross-reference
        </span>
      </div>
      <div className="mt-3 h-1.5 rounded-full bg-[var(--surface-muted)]" />
    </div>
  );
}

function BigLastWeekCell({
  channel,
  rollup,
  target,
}: {
  channel: Channel;
  rollup: Record<string, number | string[]>;
  target: number;
}) {
  const text = renderCell(channel.cell_format, rollup, channel.metrics_schema);
  const primary = primaryCount(channel, rollup) ?? numFromRollup(rollup, 'install');

  // Multi-key cells (Inside Sales, HVAC, Internal): show the rendered text;
  // can't compute a meaningful gap chip without a single primary count.
  if (primary == null || !target) {
    return <span className="num text-[var(--ink)] text-base font-medium">{text}</span>;
  }
  const gap = primary - target;
  const onTrack = gap >= 0;
  const gapText = gap >= 0 ? `+${gap}` : `${gap}`;
  return (
    <div className="flex items-baseline gap-2 num">
      <span className="text-2xl font-semibold tracking-tight text-[var(--ink)]">{primary}</span>
      <span className="text-[var(--border-strong)] text-xs">/</span>
      <span className="text-sm text-[var(--muted)]">{target}</span>
      <span
        className={`chip ${onTrack ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}
      >
        {gapText}
      </span>
    </div>
  );
}

function Sparkline({
  values,
  status,
}: {
  values: number[];
  status: 'ok' | 'warn' | 'bad' | 'neutral';
}) {
  if (values.length < 2 || values.every((v) => v === 0)) {
    return <span className="text-[var(--border-strong)] text-xs">—</span>;
  }
  const max = Math.max(...values, 1);
  const min = 0;
  const w = 96;
  const h = 28;
  const stroke =
    status === 'ok' ? '#10b981' :
    status === 'warn' ? '#f59e0b' :
    status === 'bad' ? '#f43f5e' :
    'var(--brand-cyan)';
  const fill =
    status === 'ok' ? 'rgba(16,185,129,0.10)' :
    status === 'warn' ? 'rgba(245,158,11,0.10)' :
    status === 'bad' ? 'rgba(244,63,94,0.10)' :
    'rgba(0,184,243,0.10)';

  const xs = values.map((_, i) => (i / (values.length - 1)) * w);
  const ys = values.map((v) => h - ((v - min) / (max - min || 1)) * h);
  const linePath = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${xs[xs.length - 1].toFixed(1)},${h} L${xs[0].toFixed(1)},${h} Z`;
  const lastX = xs[xs.length - 1];
  const lastY = ys[ys.length - 1];

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h + 2}`} aria-hidden className="overflow-visible">
      <path d={areaPath} fill={fill} />
      <path d={linePath} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r="2.5" fill={stroke} stroke="white" strokeWidth="1" />
    </svg>
  );
}

function TotalCard({
  label,
  subtitle,
  actual,
  target,
  gap,
  accent,
  hero = false,
}: {
  label: string;
  subtitle: string;
  actual: number;
  target: number;
  gap: number;
  accent: 'navy' | 'cyan';
  /** Bento hero variant: spans 2 cols + 2 rows on lg, larger numbers. */
  hero?: boolean;
}) {
  const onTrack = gap >= 0;
  const gapPct = target ? Math.round((actual / target) * 100) : 0;
  const accentBar =
    accent === 'navy'
      ? 'bg-gradient-to-r from-[var(--brand-navy)] to-[var(--brand-cyan)]'
      : 'bg-gradient-to-r from-[var(--brand-cyan)] to-[var(--brand-cyan-soft)]';
  const numClass = hero
    ? 'text-6xl font-bold tracking-tight text-[var(--ink)]'
    : 'text-4xl font-bold tracking-tight text-[var(--ink)]';
  const wrapperClass = hero
    ? 'lg:col-span-2 lg:row-span-2 p-7'
    : 'p-6';
  return (
    <div
      className={`glass group relative rounded-2xl overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_2px_4px_rgba(10,24,40,0.04),0_18px_40px_-20px_rgba(10,24,40,0.18)] ${wrapperClass}`}
    >
      <div className={`absolute inset-x-0 top-0 h-[3px] ${accentBar}`} />
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className={hero ? 'text-base font-semibold text-[var(--ink)]' : 'text-sm font-medium text-[var(--ink)]'}>
            {label}
          </h2>
          <p className="text-xs text-[var(--muted)] mt-0.5">{subtitle}</p>
        </div>
        <span
          className={`chip ${onTrack ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}
        >
          {gap >= 0 ? `+${gap}` : `${gap}`}
        </span>
      </div>
      <div className={`flex items-end justify-between ${hero ? 'mt-8' : 'mt-5'}`}>
        <div className="flex items-baseline gap-2 num">
          <CountUp value={actual} className={numClass} />
          <span className="text-[var(--muted)] text-sm">/ {formatCount(target)}</span>
        </div>
        <span className="text-xs text-[var(--muted)] num">{gapPct}% of target</span>
      </div>
      <div className={`rounded-full bg-[var(--surface-muted)] overflow-hidden ${hero ? 'mt-4 h-2' : 'mt-3 h-1.5'}`}>
        <div
          className={`h-full ${onTrack ? 'bg-emerald-500' : 'bg-rose-500'} transition-[width] duration-700 ease-out`}
          style={{ width: `${Math.min(100, gapPct)}%` }}
        />
      </div>
    </div>
  );
}

function FreshChip({ ts }: { ts: string }) {
  const ageMs = Date.now() - new Date(ts).getTime();
  const ageMin = Math.floor(ageMs / 60_000);
  if (ageMin < 0) return null;
  const label =
    ageMin < 1 ? 'just now' :
    ageMin < 60 ? `${ageMin}m ago` :
    ageMin < 60 * 24 ? `${Math.floor(ageMin / 60)}h ago` :
    `${Math.floor(ageMin / (60 * 24))}d ago`;
  const fresh = ageMin < 60 * 24; // within 24h
  return (
    <span
      className={`chip ${
        fresh
          ? 'bg-[var(--brand-cyan-soft)] text-[var(--ink)]'
          : 'bg-[var(--surface-muted)] text-[var(--muted)]'
      }`}
      title={`Last entered ${new Date(ts).toLocaleString()}`}
    >
      {label}
    </span>
  );
}

// Build options for the WeekPicker — last N weeks ending Sunday, most recent first.
function buildWeekOptions(currentSunday: Date, count = 26) {
  const today = new Date();
  const todaySunday = mostRecentSunday(today);
  const todayIso = isoDate(todaySunday);

  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const opts: { value: string; label: string; tag?: string }[] = [];
  const cursor = new Date(currentSunday > todaySunday ? currentSunday : todaySunday);
  for (let i = 0; i < count; i++) {
    const sunday = new Date(cursor);
    const monday = new Date(sunday);
    monday.setDate(monday.getDate() - 6);
    const value = isoDate(sunday);
    const sameYear = monday.getFullYear() === sunday.getFullYear();
    const label =
      `${fmt(monday)} → ${fmt(sunday)}` +
      (sameYear ? `, ${sunday.getFullYear()}` : ` ${sunday.getFullYear()}`);
    let tag: string | undefined;
    if (value === todayIso) tag = 'This week';
    else if (i === 1 && opts[0]?.tag === 'This week') tag = 'Last week';

    opts.push({ value, label, tag });
    cursor.setDate(cursor.getDate() - 7);
  }
  return opts;
}

function Th({ children, align = 'left' }: { children?: React.ReactNode; align?: 'left' | 'right' }) {
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
  colSpan,
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
  className?: string;
  colSpan?: number;
}) {
  return (
    <td colSpan={colSpan} className={`px-4 py-3 text-${align} ${className}`}>
      {children}
    </td>
  );
}
