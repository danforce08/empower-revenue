import Link from 'next/link';
import { getSupabaseServer } from '@/lib/supabase/server';
import {
  isoDate,
  monthEnd,
  monthStart,
  mostRecentSunday,
  parseIsoDate,
  previousWeek,
  quarterStart,
  weekEnd,
  weekStart,
  yearStart,
} from '@/lib/periods';
import { formatCount, formatCurrency } from '@/lib/cell-format';
import { rollupMetrics, rowsInRange } from '@/lib/rollups';
import type { Channel, MetricRow } from '@/lib/types';
import type { DealFact } from '@/lib/jobflo-parser';
import { WeekPicker } from '@/components/week-picker';
import { BasisToggle, type Basis } from '@/components/basis-toggle';
import { ActiveRepsChart } from '@/components/active-reps-chart';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Shared chrome for KPI/leaderboard cards. Hero variant uses a thick cyan
// border, a soft cyan-tinted gradient, and a glow shadow so the YTD
// (or other "this is the headline number") card actually wins the eye —
// previously the hero/non-hero diff was a single CSS-variable swap that
// rendered as ~5% visual difference.
const CARD_BASE = 'rounded-2xl border bg-[var(--surface)] p-5 shadow-[0_1px_2px_rgba(10,24,40,0.04),0_8px_24px_-12px_rgba(10,24,40,0.08)] border-[var(--border)]';
const CARD_HERO = 'rounded-2xl border-2 border-[var(--brand-cyan)] p-5 shadow-[0_0_0_4px_rgba(0,184,243,0.06),0_12px_36px_-12px_rgba(0,184,243,0.32)] bg-gradient-to-br from-[var(--brand-cyan-soft)] to-[var(--surface)]';

// Per-channel revenue per install fallbacks, sourced from the Quantum 250x28
// sheet's Average Contract Value column. Used when no active scenario is
// configured in the forecast tool.
const REVENUE_PER_INSTALL_FALLBACK: Record<string, number> = {
  total_sales: 50_000,   // Solar + Storage
  battery_only: 50_000,  // Storage Only
  roof: 19_000,          // Roofing
  hvac: 21_000,          // HVAC New Install
};

// Annual revenue target fallback. Used when no active scenario exists.
const ANNUAL_REVENUE_TARGET_FALLBACK = 115_000_000;

const ONE_DAY_MS = 86_400_000;

// Defensive read-time normalization for the org leaderboard. Older buckets
// in the DB store lowercase org labels (`nusun`, `ion solar`) and a few
// garbage values (`ar distribution`). New parser writes are already title-
// cased + filtered, but until those rows age out we clean up here.
//
// NOTE: 'Call Center' is intentionally kept separate from 'Empower X'.
// See lib/jobflo-parser.ts for rationale — Call Center is the Inside Sales
// org and merging it loses channel-level attribution.
const ORG_DISPLAY_OVERRIDES: Record<string, string> = {
  'empower x': 'Empower X',
  'empowerx': 'Empower X',
  'empower home services': 'Empower X',
  'empower services': 'Empower X',
  'call center': 'Call Center',
};

export const dynamic = 'force-dynamic';

type PageProps = { searchParams: Promise<{ week?: string; basis?: string }> };

/**
 * "Dashboard" page (per Dan + David's original meeting). Sits alongside the
 * Weekly Review at `/`. This page is the home for sales-activity metrics:
 *   - Active reps and Deals/active rep (from Jobflo's `unique_reps` arrays)
 *   - New reps and New dealers (from a Google Sheet — wired in Phase B)
 */
export default async function DashboardPage({ searchParams }: PageProps) {
  const params = await searchParams;
  // Date basis for the whole dashboard: 'sold' (account created/sold date,
  // the default) or 'installed' (install completed date). Drives the volume
  // cards, Clean Deal %, and leaderboard via the per-account deal_facts table.
  const basis: Basis = params.basis === 'installed' ? 'installed' : 'sold';
  const today = new Date();
  const explicitlyPicked = !!params.week;
  const weekEndingDate = explicitlyPicked ? parseIsoDate(params.week as string) : mostRecentSunday();
  // Anchor for "This Week" / "Last Week" / MTD / QTD / YTD ranges.
  //   - Default load (no ?week param): anchor = today so MTD/YTD include
  //     real-time activity through today and "This Week" reflects the
  //     current in-progress calendar week.
  //   - User explicitly picked a past Sunday: anchor = that Sunday, so
  //     the whole dashboard reads "as of" that point in time. Previously
  //     this ignored past picker values (anchor was always max(today,
  //     picker)) — selecting a past week was a no-op.
  const anchor = explicitlyPicked ? weekEndingDate : today;
  // "Last Week" semantics:
  //  - Explicit picker: the picker's full Mon-Sun week. Matches Weekly
  //    Review's "Last Week Scoreboard" so the two pages agree on which
  //    week's number is being shown.
  //  - Default (no picker): the most-recently-completed full week
  //    relative to today.
  // "This Week" is always the current real-world calendar week (Mon →
  // today), regardless of picker — so a historical review still surfaces
  // "what's happening right now" in that card.
  let lastWeekStartDate: Date;
  let lastWeekEndDate: Date;
  if (explicitlyPicked) {
    lastWeekStartDate = weekStart(weekEndingDate);
    lastWeekEndDate = weekEnd(weekEndingDate);
  } else {
    const prev = previousWeek(weekStart(today));
    lastWeekStartDate = prev.start;
    lastWeekEndDate = prev.end;
  }
  const thisWeekStart = weekStart(today);
  const lastWeek = { start: lastWeekStartDate, end: lastWeekEndDate };
  const mtdStart = monthStart(anchor);
  const qtdStart = quarterStart(anchor);
  const ytdStart = yearStart(anchor);
  // Last full calendar month, used by the Clean Deal % "Last Month" card
  // and the Active Reps chart's "Last Month" summary stat.
  const lastMonthStart = new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1);
  const lastMonthEnd = monthEnd(lastMonthStart);
  // Fetch range starts from the earlier of YTD start vs last-month start so
  // January's "last month" still has rows (it's December of the prior year).
  const fetchStart = lastMonthStart < ytdStart ? lastMonthStart : ytdStart;
  const weekEndingIso = isoDate(weekEndingDate);
  const thisWeekStartIso = isoDate(thisWeekStart);
  const lastWeekStartIso = isoDate(lastWeek.start);
  const lastWeekEndIso = isoDate(lastWeek.end);
  const mtdStartIso = isoDate(mtdStart);
  const qtdStartIso = isoDate(qtdStart);
  const ytdStartIso = isoDate(ytdStart);
  const lastMonthStartIso = isoDate(lastMonthStart);
  const lastMonthEndIso = isoDate(lastMonthEnd);
  const fetchStartIso = isoDate(fetchStart);
  const cumulativeEndIso = isoDate(anchor);
  // Today's ISO — used as the "This Week" card's upper bound so that
  // card always renders the current real-world partial week regardless
  // of whether the picker is set to a past date.
  const todayIso = isoDate(today);

  const supabase = await getSupabaseServer();

  // Page through queries that can exceed Supabase's hard `db.max-rows` cap
  // (silently clips at 1000 rows regardless of how big a `.range()` you ask
  // for). `.range()` alone is not enough to escape the cap — you have to
  // actually paginate with explicit ORDER BY + repeated requests.
  // Discovered May 2026: the dashboard was reading only ~1000 of ~1500
  // daily_rep_activity rows, sorted by PK (rep_name, activity_date, kind),
  // which silently clipped late-alphabet reps. The "current month" was
  // entirely empty because, by chance, those reps' dates happen to land
  // late in the alphabetical sort order too.
  const PAGE = 1000;
  type DailyRep = { rep_name: string; activity_date: string; dealer_org: string | null; kind: 'sale' | 'install' };
  async function fetchAllDailyReps(): Promise<DailyRep[]> {
    const out: DailyRep[] = [];
    let from = 0;
    for (let i = 0; i < 100; i++) {
      // Order by the FULL composite PK so pagination is stable across
      // ties — `activity_date` alone has ties (many reps share a date)
      // and Postgres doesn't promise a consistent in-tie ordering across
      // separate Range requests, which would silently dupe or skip rows.
      const { data, error } = await supabase
        .from('daily_rep_activity')
        .select('rep_name, activity_date, dealer_org, kind')
        .gte('activity_date', fetchStartIso)
        .lte('activity_date', cumulativeEndIso)
        .order('activity_date', { ascending: false })
        .order('rep_name', { ascending: true })
        .order('kind', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error || !data || data.length === 0) break;
      out.push(...(data as DailyRep[]));
      if (data.length < PAGE) break;
      from += PAGE;
    }
    return out;
  }
  async function fetchAllMetrics(): Promise<MetricRow[]> {
    const out: MetricRow[] = [];
    let from = 0;
    for (let i = 0; i < 100; i++) {
      // Same reasoning — `period_start` has heavy ties (multiple
      // channels × branches per week). `id` is the PK so it makes the
      // sort total.
      const { data, error } = await supabase
        .from('metrics')
        .select('*')
        .gte('period_end', fetchStartIso)
        .lte('period_start', cumulativeEndIso)
        .order('period_start', { ascending: false })
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error || !data || data.length === 0) break;
      out.push(...(data as MetricRow[]));
      if (data.length < PAGE) break;
      from += PAGE;
    }
    return out;
  }

  async function fetchAllDealFacts(): Promise<DealFact[]> {
    const out: DealFact[] = [];
    let from = 0;
    for (let i = 0; i < 100; i++) {
      const { data, error } = await supabase
        .from('deal_facts')
        .select('*')
        .order('account_id', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error || !data || data.length === 0) break;
      out.push(...(data as DealFact[]));
      if (data.length < PAGE) break;
      from += PAGE;
    }
    return out;
  }

  const [channelsRes, metrics, recruitmentRes, dailyReps, scenarioRes, dealFacts] = await Promise.all([
    supabase.from('channels').select('*').order('sort_order'),
    fetchAllMetrics(),
    supabase
      .from('weekly_recruitment')
      .select('period_start, period_end, new_reps, new_dealers')
      .order('period_start'),
    fetchAllDailyReps(),
    // Active forecast scenario — drives revenue per install + annual target
    // so Dashboard stays in sync with whatever's configured on the forecast
    // page. Falls back to in-code constants when no scenario is marked.
    supabase
      .from('scenarios')
      .select('scenario_data')
      .eq('is_active_target', true)
      .maybeSingle(),
    fetchAllDealFacts(),
  ]);

  const channels = (channelsRes.data ?? []) as Channel[];

  // ---- deal_facts: the Sold ↔ Installed toggle ----
  // One row per classified account carrying both its sold_date and the two
  // install milestones (Install Completed for solar/battery/hvac, Roof Install
  // Completed for roof). SOLD mode keeps reading the metric buckets unchanged
  // (zero regression on the validated numbers); deal_facts power INSTALLED
  // mode and the cross-milestone sub-lines. Until the first post-deploy
  // re-upload populates the table, `useFacts` is false and installed mode
  // falls back to the metric installs.
  const useFacts = dealFacts.length > 0;
  const factFlags = (f: DealFact): number =>
    (f.is_solar ? 1 : 0) + (f.is_battery ? 1 : 0) + (f.is_roof ? 1 : 0) + (f.is_hvac ? 1 : 0);
  const inWin = (d: string | null, s: string, e: string): boolean => !!d && d >= s && d <= e;
  // An account is "installed in [s,e]" if any product hit its completion date
  // there — solar/battery/hvac on install_date, roof on roof_install_date.
  const installedInWin = (f: DealFact, s: string, e: string): boolean =>
    inWin(f.install_date, s, e) || inWin(f.roof_install_date, s, e);

  // Sold-mode sub-line: of the per-channel volume SOLD in [s,e], how much has
  // installed (any product) — pull-through. Flag-sum to match the headline.
  function factPullThrough(s: string, e: string): number {
    let v = 0;
    for (const f of dealFacts) {
      if (f.sold_date >= s && f.sold_date <= e && (f.install_date || f.roof_install_date)) v += factFlags(f);
    }
    return v;
  }
  // Installed-mode volume: per product on ITS OWN completion date (mirrors the
  // metric buckets, so it reconciles with the existing installs total). `sub`
  // = the portion that was also SOLD within the same window.
  function factInstalledVolume(s: string, e: string): { deals: number; sub: number } {
    let deals = 0;
    let sub = 0;
    for (const f of dealFacts) {
      const icIn = inWin(f.install_date, s, e);
      const rcIn = inWin(f.roof_install_date, s, e);
      const soldIn = f.sold_date >= s && f.sold_date <= e;
      const add = (cond: boolean) => { if (cond) { deals += 1; if (soldIn) sub += 1; } };
      add(!!f.is_solar && icIn);
      add(!!f.is_battery && icIn);
      add(!!f.is_hvac && icIn);
      add(!!f.is_roof && rcIn);
    }
    return { deals, sub };
  }
  // Installed-mode Clean Deal % — among accounts installed in [s,e].
  function factCleanDeal(s: string, e: string): { created: number; clean: number; override: number; pct: number | null } {
    let created = 0, clean = 0, override = 0;
    for (const f of dealFacts) {
      if (!installedInWin(f, s, e)) continue;
      created += 1;
      if (f.is_clean) clean += 1;
      if (f.is_clean && f.clean_via_participate) override += 1;
    }
    return { created, clean, override, pct: created > 0 ? clean / created : null };
  }
  // Installed-mode leaderboard — accounts installed in [s,e], by org.
  function factLeaderboard(s: string, e: string): Array<{ org: string; deals: number }> {
    const totals = new Map<string, number>();
    for (const f of dealFacts) {
      if (!installedInWin(f, s, e)) continue;
      const org = f.dealer_org ? displayOrgLabel(f.dealer_org) : null;
      if (!org) continue;
      totals.set(org, (totals.get(org) ?? 0) + 1);
    }
    return Array.from(totals.entries())
      .map(([org, deals]) => ({ org, deals }))
      .sort((a, b) => b.deals - a.deals);
  }
  const recruitment = (recruitmentRes.data ?? []) as Array<{
    period_start: string;
    period_end: string;
    new_reps: number;
    new_dealers: number;
  }>;

  // Resolve revenue assumptions from the active forecast scenario; fall back
  // to in-code constants if none is marked active.
  const scenarioData = (scenarioRes.data?.scenario_data ?? null) as null | {
    activeReps?: number;
    dealsPerRep?: number;
    pullThrough?: number;
    revenuePerInstall?: number;
  };
  const flatRate = scenarioData?.revenuePerInstall;
  const REVENUE_PER_INSTALL: Record<string, number> = flatRate
    ? { total_sales: flatRate, battery_only: flatRate, roof: flatRate, hvac: flatRate }
    : REVENUE_PER_INSTALL_FALLBACK;
  const annualTargetFromScenario =
    scenarioData?.activeReps && scenarioData?.dealsPerRep && scenarioData?.pullThrough && scenarioData?.revenuePerInstall
      ? scenarioData.activeReps *
        scenarioData.dealsPerRep *
        12 *
        (scenarioData.pullThrough / 100) *
        scenarioData.revenuePerInstall
      : null;
  const ANNUAL_REVENUE_TARGET = annualTargetFromScenario ?? ANNUAL_REVENUE_TARGET_FALLBACK;

  // The Jobflo parser attaches distinct-rep arrays to the `total_sales`
  // channel buckets across all qualifying deal types (excluding Labor Only
  // and IP Takeovers).
  const totalSalesChannel = channels.find((c) => c.key === 'total_sales');
  const tsRows = totalSalesChannel
    ? metrics.filter((m) => m.channel_id === totalSalesChannel.id)
    : [];

  // The dashboard now renders Active Reps as two stacked bar charts (by
  // sale + by install) instead of three numeric KPI cards, but the
  // "by sale" totals carried by the chart's summary trio replace the
  // info the cards used to show.
  const repsBySale = monthlyActiveRepsByOrg(
    dailyReps.filter((r) => r.kind === 'sale'),
    anchor,
    lastMonthStartIso,
    lastMonthEndIso,
    mtdStartIso,
    ytdStartIso,
    cumulativeEndIso,
  );
  const repsByInstall = monthlyActiveRepsByOrg(
    dailyReps.filter((r) => r.kind === 'install'),
    anchor,
    lastMonthStartIso,
    lastMonthEndIso,
    mtdStartIso,
    ytdStartIso,
    cumulativeEndIso,
  );

  // By-dealer-org leaderboard. The parser emits per-org deal counts on the
  // total_sales bucket as `org__<org>` numeric metrics, summed naturally by
  // rollupMetrics across the period.
  function orgLeaderboard(start: string, end: string): Array<{ org: string; deals: number }> {
    if (!totalSalesChannel) return [];
    // Aggregate org__* keys with proration so boundary-week buckets don't
    // inflate the totals. Older data in the DB still has lowercase org
    // labels and a few garbage entries (e.g. `ar distribution`); normalize
    // and filter at read-time so the leaderboard renders cleanly without a
    // re-upload.
    const rows = rowsInRange(tsRows, start, end);
    const totals = new Map<string, number>();
    for (const row of rows) {
      const w = bucketWeight(row.period_start, row.period_end, start, end);
      if (w <= 0) continue;
      const r = rollupMetrics([row], totalSalesChannel);
      for (const [k, v] of Object.entries(r)) {
        if (typeof v !== 'number') continue;
        if (!k.startsWith('org__')) continue;
        const raw = k.slice('org__'.length);
        const display = displayOrgLabel(raw);
        if (!display) continue;
        totals.set(display, (totals.get(display) ?? 0) + v * w);
      }
    }
    const out: Array<{ org: string; deals: number }> = [];
    for (const [org, v] of totals) {
      out.push({ org, deals: Math.round(v) });
    }
    out.sort((a, b) => b.deals - a.deals);
    return out;
  }

  const leaderboardFor = (start: string, end: string) =>
    (basis === 'installed' && useFacts ? factLeaderboard(start, end) : orgLeaderboard(start, end)).slice(0, 15);
  const orgLeaderboardYTD = leaderboardFor(ytdStartIso, cumulativeEndIso);
  const orgLeaderboardMTD = leaderboardFor(mtdStartIso, cumulativeEndIso);

  // All-products-combined volume — sum across every channel that represents
  // a customer-facing product/sale, including Inside Sales (closed_solar +
  // closed_hvac + closed_roof) and Internal (in_footprint + out_footprint).
  // A row that classifies into multiple channels (e.g. solar + roof) counts
  // once per channel — Dan's framing: "all volume, just labeled correctly."
  const SALES_CHANNEL_KEYS = [
    'total_sales',
    'battery_only',
    'roof',
    'hvac',
    'inside_sales',
    'internal',
  ] as const;
  const salesChannels = SALES_CHANNEL_KEYS
    .map((k) => channels.find((c) => c.key === k))
    .filter((c): c is Channel => !!c);
  const metricsByChannelId = new Map<string, MetricRow[]>();
  for (const m of metrics) {
    const arr = metricsByChannelId.get(m.channel_id);
    if (arr) arr.push(m);
    else metricsByChannelId.set(m.channel_id, [m]);
  }

  function pickNum(rollup: Record<string, number | string[]>, key: string): number {
    const v = rollup[key];
    return typeof v === 'number' && Number.isFinite(v) ? v : 0;
  }

  function displayOrgLabel(raw: string): string | null {
    const trimmed = raw.trim();
    if (trimmed.length < 3) return null;
    if (/^\d+$/.test(trimmed)) return null;
    const lower = trimmed.toLowerCase();
    // Garbage check — same heuristic as the parser
    if (/^[a-z]{1,2}\s+\w+$/.test(lower) && lower.split(/\s+/).length === 2) return null;
    if (ORG_DISPLAY_OVERRIDES[lower]) return ORG_DISPLAY_OVERRIDES[lower];
    // Title-case if not already (parser-emitted "Empower X" stays as-is)
    return trimmed
      .split(/\s+/)
      .map((w) => (w.length === 0 ? w : w[0].toUpperCase() + w.slice(1).toLowerCase()))
      .join(' ');
  }

  function bucketWeight(bucketStart: string, bucketEnd: string, start: string, end: string): number {
    // Clip the bucket's effective end at today. Without this, a bucket
    // whose period extends into the future (e.g. the current calendar
    // week, May 18–May 24, queried mid-week on May 20) gets prorated
    // by 3/7 even though all of its data already lives in the first 3
    // days — days 4–7 will be empty since they haven't happened. Used
    // to silently under-report This Week / MTD / QTD / YTD for the
    // most recent chunk.
    const todayIso = isoDate(today);
    const effectiveBucketEnd = bucketEnd > todayIso ? todayIso : bucketEnd;
    if (effectiveBucketEnd < bucketStart) return 0;
    const a = bucketStart > start ? bucketStart : start;
    const b = effectiveBucketEnd < end ? effectiveBucketEnd : end;
    if (a > b) return 0;
    const overlap = (Date.parse(b) - Date.parse(a)) / ONE_DAY_MS + 1;
    const total = (Date.parse(effectiveBucketEnd) - Date.parse(bucketStart)) / ONE_DAY_MS + 1;
    if (total <= 0) return 0;
    const w = overlap / total;
    return w < 0 ? 0 : w > 1 ? 1 : w;
  }

  // Sum a numeric metric across rows, weighting each row by its overlap
  // with the period. Source-of-truth filter is applied first via
  // rollupMetrics on a per-row basis so the source policy stays consistent.
  function proratedNumeric(
    rows: MetricRow[],
    channel: Channel,
    start: string,
    end: string,
    keys: string[],
  ): Record<string, number> {
    const out: Record<string, number> = {};
    for (const k of keys) out[k] = 0;
    for (const row of rows) {
      const w = bucketWeight(row.period_start, row.period_end, start, end);
      if (w <= 0) continue;
      const r = rollupMetrics([row], channel);
      for (const k of keys) {
        out[k] += pickNum(r, k) * w;
      }
    }
    return out;
  }

  type ProductionTotals = {
    deals: number;
    installs: number;
    installsByChannel: Record<string, number>;
  };

  function production(start: string, end: string): ProductionTotals {
    // Mirror the Weekly Review's "All products combined" sum so the two
    // pages always agree:
    //   Solar+Storage.accounts + Battery Only.accounts + Roofing.accounts + HVAC.install
    // Internal and Inside Sales channels are deliberately excluded — they
    // aren't product cards on Weekly Review, and including them would
    // double-count Empower X solar deals (already counted in total_sales)
    // and add internal-only rows that don't roll up to any product target.
    let deals = 0;
    let installs = 0;
    const installsByChannel: Record<string, number> = {};
    for (const ch of salesChannels) {
      const rows = rowsInRange(metricsByChannelId.get(ch.id) ?? [], start, end);
      let chDeals = 0;
      let chInstalls = 0;
      if (ch.key === 'hvac') {
        // HVAC has no separate sale-count field; its quantum target
        // tracks installs, so installs ARE the deal count (per the
        // Weekly Review's hvacActual logic).
        const summed = proratedNumeric(rows, ch, start, end, ['install']);
        chDeals = summed.install ?? 0;
        chInstalls = summed.install ?? 0;
      } else if (ch.key === 'inside_sales' || ch.key === 'internal') {
        // Not included in the product-target sum. Also no install
        // tracking on these channels today.
        chDeals = 0;
        chInstalls = 0;
      } else {
        // total_sales / battery_only / roof: accounts = deals,
        // installs = separate install events (rare overlap, e.g. a
        // customer with both solar and roof installed counts as two
        // completed install jobs — that's fine).
        const summed = proratedNumeric(rows, ch, start, end, ['accounts', 'installs']);
        chDeals = summed.accounts ?? 0;
        chInstalls = summed.installs ?? 0;
      }
      deals += chDeals;
      installs += chInstalls;
      installsByChannel[ch.key] = Math.round(chInstalls);
    }
    return { deals: Math.round(deals), installs: Math.round(installs), installsByChannel };
  }

  function revenueFromInstalls(installsByChannel: Record<string, number>): number {
    let total = 0;
    for (const [key, count] of Object.entries(installsByChannel)) {
      const rate = REVENUE_PER_INSTALL[key] ?? 0;
      total += count * rate;
    }
    return total;
  }

  // Revenue gap stays anchored to YTD installs (revenue realizes at install)
  // and does NOT follow the toggle — so it keeps reading the metric buckets.
  const prodYTD = production(ytdStartIso, cumulativeEndIso);

  // Combined Volume cards follow the Sold ↔ Installed toggle via deal_facts,
  // falling back to the metric buckets (sold semantics) until the table is
  // populated by the first re-upload.
  const cardVol = (start: string, end: string): { deals: number; sub: number } => {
    const p = production(start, end);
    if (basis === 'sold') {
      // Headline stays the metric "deals" (unchanged 2,140 etc.); sub-line is
      // the install pull-through within the sold cohort.
      return { deals: p.deals, sub: useFacts ? factPullThrough(start, end) : p.installs };
    }
    // Installed mode — per-product install volume from deal_facts; falls back
    // to the metric installs total until the table is populated.
    if (!useFacts) return { deals: p.installs, sub: 0 };
    return factInstalledVolume(start, end);
  };
  const volLast = cardVol(lastWeekStartIso, lastWeekEndIso);
  const volThis = cardVol(thisWeekStartIso, todayIso);
  const volMTD = cardVol(mtdStartIso, cumulativeEndIso);
  const volQTD = cardVol(qtdStartIso, cumulativeEndIso);
  const volYTD = cardVol(ytdStartIso, cumulativeEndIso);
  // Card labels follow the basis. Sub-line meaning: Sold → "of those sold,
  // how many installed" (pull-through); Installed → "of those installed,
  // how many were also sold in this window".
  const primaryNoun = basis === 'sold' ? 'deals' : 'installs';
  const subNoun = basis === 'sold' ? 'installed' : 'also sold';

  // Clean Deal % — total deals created vs. deals marked clean. Participate
  // Energy never backfills the Clean Deal Completed Date column, so the
  // parser counts a Participate row as clean even when that field is empty
  // (the override is captured separately as `clean_deal_participate_override`
  // so the card can footnote how much of the count came from it).
  function cleanDealRatio(start: string, end: string) {
    if (!totalSalesChannel) {
      return { created: 0, clean: 0, override: 0, pct: null as number | null };
    }
    const m = proratedNumeric(
      rowsInRange(tsRows, start, end),
      totalSalesChannel,
      start, end,
      ['accounts_created', 'clean_deal_completed', 'clean_deal_participate_override'],
    );
    const created = Math.round(m.accounts_created ?? 0);
    const clean = Math.round(m.clean_deal_completed ?? 0);
    const override = Math.round(m.clean_deal_participate_override ?? 0);
    return { created, clean, override, pct: created > 0 ? clean / created : null };
  }
  const cleanDealFor = (start: string, end: string) =>
    basis === 'installed' && useFacts ? factCleanDeal(start, end) : cleanDealRatio(start, end);
  const cleanDealLastMonth = cleanDealFor(lastMonthStartIso, lastMonthEndIso);
  const cleanDealThisMonth = cleanDealFor(mtdStartIso, cumulativeEndIso);
  const cleanDealYTD       = cleanDealFor(ytdStartIso, cumulativeEndIso);

  // Roll up daily_rep_activity into per-month, per-org distinct rep
  // counts. Returns recharts-ready data (one row per month with one
  // numeric field per org) plus the orgs to render as stacked Bars and
  // a summary trio for the chart's header.
  function monthlyActiveRepsByOrg(
    rows: Array<{ rep_name: string; activity_date: string; dealer_org: string | null }>,
    chartAnchor: Date,
    lastMonthStartArg: string,
    lastMonthEndArg: string,
    thisMonthStartArg: string,
    ytdStartArg: string,
    cumulativeEndArg: string,
  ): {
    data: Array<Record<string, string | number>>;
    orgs: string[];
    summary: { lastMonth: number; thisMonth: number; ytd: number };
  } {
    // YTD subset for the bars
    const ytdRows = rows.filter(
      (r) => r.activity_date >= ytdStartArg && r.activity_date <= cumulativeEndArg,
    );
    // (month 'YYYY-MM') -> (org -> Set<rep>)
    const byMonthOrg = new Map<string, Map<string, Set<string>>>();
    for (const r of ytdRows) {
      const monthKey = r.activity_date.slice(0, 7);
      const display = r.dealer_org ? displayOrgLabel(r.dealer_org) : null;
      const org = display ?? 'Unassigned';
      let m = byMonthOrg.get(monthKey);
      if (!m) { m = new Map(); byMonthOrg.set(monthKey, m); }
      let s = m.get(org);
      if (!s) { s = new Set<string>(); m.set(org, s); }
      s.add(r.rep_name);
    }
    // Top-12 orgs by total contribution; everything else collapses into 'Other'
    const orgTotals = new Map<string, number>();
    for (const monthMap of byMonthOrg.values()) {
      for (const [org, repSet] of monthMap) {
        orgTotals.set(org, (orgTotals.get(org) ?? 0) + repSet.size);
      }
    }
    const sorted = Array.from(orgTotals.entries()).sort((a, b) => b[1] - a[1]);
    const top12 = sorted.slice(0, 12).map(([k]) => k);
    const otherSet = new Set(sorted.slice(12).map(([k]) => k));
    const orgs = otherSet.size > 0 ? [...top12, 'Other'] : top12;

    // Build chart data: months Jan..currentMonth (anchored to the year)
    const startYear = chartAnchor.getFullYear();
    const endMonth = chartAnchor.getMonth();
    const data: Array<Record<string, string | number>> = [];
    for (let mi = 0; mi <= endMonth; mi++) {
      const dt = new Date(startYear, mi, 1);
      const monthKey = isoDate(dt).slice(0, 7);
      const row: Record<string, string | number> = { month: MONTH_LABELS[mi] };
      const monthMap = byMonthOrg.get(monthKey);
      if (monthMap) {
        for (const org of top12) row[org] = monthMap.get(org)?.size ?? 0;
        if (otherSet.size > 0) {
          let otherCount = 0;
          for (const [org, s] of monthMap) {
            if (otherSet.has(org)) otherCount += s.size;
          }
          row['Other'] = otherCount;
        }
      } else {
        for (const org of orgs) row[org] = 0;
      }
      data.push(row);
    }

    // Summary stats — distinct reps across the whole window (org-agnostic)
    function distinctRepsBetween(startIso: string, endIso: string): number {
      const seen = new Set<string>();
      for (const r of rows) {
        if (r.activity_date >= startIso && r.activity_date <= endIso) {
          seen.add(r.rep_name);
        }
      }
      return seen.size;
    }
    return {
      data,
      orgs,
      summary: {
        lastMonth: distinctRepsBetween(lastMonthStartArg, lastMonthEndArg),
        thisMonth: distinctRepsBetween(thisMonthStartArg, cumulativeEndArg),
        ytd:       distinctRepsBetween(ytdStartArg, cumulativeEndArg),
      },
    };
  }

  // Quantum revenue gap — multiply each channel's YTD installs by its own
  // per-install revenue rate from the Quantum sheet, then compare against
  // the $115M annual target.
  const ytdRevenue = revenueFromInstalls(prodYTD.installsByChannel);
  const revenueGap = ANNUAL_REVENUE_TARGET - ytdRevenue;
  const revenuePct = ANNUAL_REVENUE_TARGET > 0
    ? (ytdRevenue / ANNUAL_REVENUE_TARGET) * 100
    : 0;

  // Recruitment is sourced from the onboarding sheet's `Stats` tab weekly
  // rows. Dan owns the formulas; we just sum + prorate the relevant weeks
  // here. Boundary weeks that straddle the period (e.g. a "Week of 4/27-5/3"
  // bucket when MTD starts May 1) get weighted by overlapping days.
  function sumWeeklyRange(start: string, end: string): { reps: number; dealers: number } {
    let reps = 0;
    let dealers = 0;
    for (const r of recruitment) {
      const w = bucketWeight(r.period_start, r.period_end, start, end);
      if (w <= 0) continue;
      reps += (r.new_reps ?? 0) * w;
      dealers += (r.new_dealers ?? 0) * w;
    }
    return { reps: Math.round(reps), dealers: Math.round(dealers) };
  }

  const mtdNew = sumWeeklyRange(mtdStartIso, cumulativeEndIso);
  const qtdNew = sumWeeklyRange(qtdStartIso, cumulativeEndIso);
  const ytdNew = sumWeeklyRange(ytdStartIso, cumulativeEndIso);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-10 anim-fade-rise">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--brand-cyan)] font-medium mb-2">
            Dashboard
          </p>
          <h1 className="text-2xl sm:text-4xl font-semibold tracking-tight text-[var(--ink)]">
            Sales activity
          </h1>
          <p className="text-sm text-[var(--muted)] mt-2">
            Week ending <span className="num font-medium text-[var(--foreground)]">{weekEndingIso}</span>
          </p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <BasisToggle current={basis} />
          <WeekPicker
            current={weekEndingIso}
            options={buildWeekOptions(weekEndingDate, 26)}
          />
        </div>
      </div>

      <section className="mb-10 anim-fade-rise stagger-1">
        <SectionHeader
          eyebrow="All Products"
          title="Combined volume — deals + installs"
          subtitle={
            basis === 'sold'
              ? 'Accounts by sold date · sub-line = how many of that cohort have installed (pull-through)'
              : 'Accounts by install-completed date · sub-line = how many were also sold in the same period'
          }
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <ProductionCard
            label="Last Week"
            range={`${shortDate(lastWeekStartIso)}–${shortDate(lastWeekEndIso)}`}
            primary={volLast.deals} sub={volLast.sub} primaryNoun={primaryNoun} subNoun={subNoun}
          />
          <ProductionCard
            label="This Week"
            range={`${shortDate(thisWeekStartIso)}–${shortDate(todayIso)}`}
            primary={volThis.deals} sub={volThis.sub} primaryNoun={primaryNoun} subNoun={subNoun}
          />
          <ProductionCard
            label="MTD"
            range={`${shortDate(mtdStartIso)}–${shortDate(cumulativeEndIso)}`}
            primary={volMTD.deals} sub={volMTD.sub} primaryNoun={primaryNoun} subNoun={subNoun}
          />
          <ProductionCard
            label="QTD"
            range={`${shortDate(qtdStartIso)}–${shortDate(cumulativeEndIso)}`}
            primary={volQTD.deals} sub={volQTD.sub} primaryNoun={primaryNoun} subNoun={subNoun}
          />
          <ProductionCard
            label="YTD"
            range={`${shortDate(ytdStartIso)}–${shortDate(cumulativeEndIso)}`}
            primary={volYTD.deals} sub={volYTD.sub} primaryNoun={primaryNoun} subNoun={subNoun} hero
          />
        </div>
      </section>

      <section className="mb-10 anim-fade-rise stagger-2">
        <SectionHeader
          eyebrow="Clean Deal %"
          title="Created deals marked clean"
          subtitle="Clean Deal Completed Date populated, OR Funding Partner = Participate Energy (Participate never backfills the field, so we count their deals as clean by default)"
        />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <CleanDealCard
            label="Last Month"
            range={`${shortDate(lastMonthStartIso)}–${shortDate(lastMonthEndIso)}`}
            data={cleanDealLastMonth}
          />
          <CleanDealCard
            label="This Month"
            range={`${shortDate(mtdStartIso)}–${shortDate(cumulativeEndIso)}`}
            data={cleanDealThisMonth}
          />
          <CleanDealCard
            label="YTD"
            range={`${shortDate(ytdStartIso)}–${shortDate(cumulativeEndIso)}`}
            data={cleanDealYTD}
            hero
          />
        </div>
      </section>

      <section className="mb-10 anim-fade-rise stagger-2">
        <SectionHeader
          eyebrow="Quantum"
          title="Annual revenue gap"
          subtitle={
            scenarioData?.revenuePerInstall
              ? `YTD installs × $${(scenarioData.revenuePerInstall / 1000).toFixed(0)}K (from active forecast scenario) vs $${(ANNUAL_REVENUE_TARGET / 1_000_000).toFixed(1)}M annual target`
              : `YTD installs × per-channel contract value (fallback) vs $${(ANNUAL_REVENUE_TARGET / 1_000_000).toFixed(0)}M annual target`
          }
        />
        <div className="rounded-2xl border border-[var(--brand-cyan-soft)] bg-[var(--surface)] p-5 sm:p-6 shadow-[0_1px_2px_rgba(10,24,40,0.04),0_8px_24px_-12px_rgba(10,24,40,0.08)]">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
            <RevenueStat label="YTD revenue" value={formatCurrency(ytdRevenue)} hero />
            <RevenueStat label="Annual target" value={formatCurrency(ANNUAL_REVENUE_TARGET)} />
            <RevenueStat
              label="Gap"
              value={revenueGap >= 0 ? `−${formatCurrency(revenueGap)}` : `+${formatCurrency(Math.abs(revenueGap))}`}
              tone={revenueGap >= 0 ? 'warn' : 'ok'}
            />
            <RevenueStat label="Progress" value={`${revenuePct.toFixed(1)}%`} />
          </div>
          <div className="h-2 rounded-full bg-[var(--surface-muted)] overflow-hidden">
            <div
              className={`h-full transition-[width] duration-500 ${
                revenuePct >= 100 ? 'bg-emerald-400' : revenuePct >= 50 ? 'bg-amber-400' : 'bg-rose-400'
              }`}
              style={{ width: `${Math.min(100, Math.max(0, revenuePct))}%` }}
            />
          </div>
        </div>
      </section>

      <section className="mb-10 anim-fade-rise stagger-3">
        <SectionHeader
          eyebrow="Active reps"
          title="Reps with at least one sale or install per month"
          subtitle="Distinct reps per month · stacked by sales team · excludes Labor Only and IP Takeovers · install chart needs a re-upload after the migration to populate historical install dates"
        />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ActiveRepsChart
            title="By sale"
            subtitle="Reps with ≥1 qualifying sale that month"
            data={repsBySale.data}
            orgs={repsBySale.orgs}
            summary={repsBySale.summary}
          />
          <ActiveRepsChart
            title="By install"
            subtitle="Reps with ≥1 completed install that month"
            data={repsByInstall.data}
            orgs={repsByInstall.orgs}
            summary={repsByInstall.summary}
          />
        </div>
      </section>

      <section className="mb-10 anim-fade-rise stagger-4">
        <SectionHeader
          eyebrow="Sales Team Mix"
          title="By sales team · top 15"
          subtitle="Deals per team (dealer orgs + Empower X internal) across all qualifying channels · excludes Labor Only and IP Takeovers"
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Leaderboard label="MTD" rows={orgLeaderboardMTD} />
          <Leaderboard label="YTD" rows={orgLeaderboardYTD} hero />
        </div>
      </section>

      <section className="mb-10 anim-fade-rise stagger-5">
        <SectionHeader
          eyebrow="Recruitment"
          title="New reps + new dealers"
          subtitle="From the onboarding sheet's Stats tab · weekly granularity, boundary weeks prorated"
        />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <RecruitmentCard label="MTD" reps={mtdNew.reps} dealers={mtdNew.dealers} />
          <RecruitmentCard label="QTD" reps={qtdNew.reps} dealers={qtdNew.dealers} />
          <RecruitmentCard label="YTD" reps={ytdNew.reps} dealers={ytdNew.dealers} hero />
        </div>
      </section>

      <p className="text-xs text-[var(--muted)]">
        Looking for last-week scoreboard, MTD/QTD/YTD by channel, or Quantum targets?{' '}
        <Link href="/" className="text-[var(--brand-cyan)] hover:underline">Weekly Review</Link>.
      </p>
    </div>
  );
}

function SectionHeader({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs uppercase tracking-[0.14em] font-semibold text-[var(--brand-cyan)]">
          {eyebrow}
        </span>
        <h2 className="text-sm font-medium text-[var(--ink)]">{title}</h2>
      </div>
      <p className="text-xs text-[var(--muted)]">{subtitle}</p>
    </div>
  );
}

function CleanDealCard({
  label,
  range,
  data,
  hero,
}: {
  label: string;
  range: string;
  data: { created: number; clean: number; override: number; pct: number | null };
  hero?: boolean;
}) {
  const pctText = data.pct == null ? '—' : `${(data.pct * 100).toFixed(1)}%`;
  return (
    <div className={hero ? CARD_HERO : CARD_BASE}>
      <div className={`text-xs uppercase tracking-[0.14em] font-semibold mb-1 ${hero ? 'text-[var(--brand-cyan)]' : 'text-[var(--muted)]'}`}>
        {label}
      </div>
      <div className="text-[10px] num text-[var(--muted)] mb-2">{range}</div>
      <div className="flex items-baseline gap-2 mb-1">
        <span className={`num font-semibold text-[var(--ink)] ${hero ? 'text-5xl sm:text-6xl' : 'text-3xl'}`}>
          {pctText}
        </span>
      </div>
      <div className="text-sm text-[var(--foreground)] num">
        {formatCount(data.clean)}{' '}
        <span className="text-[var(--muted)]">of {formatCount(data.created)} deals clean</span>
      </div>
      {data.override > 0 && (
        <div className="text-xs text-[var(--muted)] num mt-1">
          incl. {formatCount(data.override)} via Participate override
        </div>
      )}
    </div>
  );
}

function Leaderboard({
  label,
  rows,
  hero,
}: {
  label: string;
  rows: Array<{ org: string; deals: number }>;
  hero?: boolean;
}) {
  const max = rows.reduce((m, r) => Math.max(m, r.deals), 0);
  return (
    <div className={hero ? CARD_HERO : CARD_BASE}>
      <div className={`text-xs uppercase tracking-[0.14em] font-semibold mb-3 ${hero ? 'text-[var(--brand-cyan)]' : 'text-[var(--muted)]'}`}>
        {label}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          No org-level data yet. Re-upload the Jobflo export so the parser
          populates per-org counts.
        </p>
      ) : (
        <ol className="space-y-2">
          {rows.map((r, i) => (
            <li key={r.org} className="flex items-center gap-3">
              <span className="num text-xs text-[var(--muted)] w-5 text-right">{i + 1}.</span>
              <span className="flex-1 text-sm text-[var(--foreground)] capitalize truncate">
                {r.org}
              </span>
              <span className="num text-sm font-medium text-[var(--ink)] w-12 text-right">
                {r.deals}
              </span>
              <div className="hidden sm:block w-24 h-1.5 rounded-full bg-[var(--surface-muted)] overflow-hidden">
                <div
                  className="h-full bg-[var(--brand-cyan)] transition-[width] duration-500"
                  style={{ width: max > 0 ? `${(r.deals / max) * 100}%` : '0%' }}
                />
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function shortDate(iso: string): string {
  // YYYY-MM-DD → "Mon D" without timezone shifting (everything is local).
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[parseInt(m[2], 10) - 1]} ${parseInt(m[3], 10)}`;
}

function ProductionCard({
  label,
  range,
  primary,
  sub,
  primaryNoun,
  subNoun,
  hero,
}: {
  label: string;
  range?: string;
  primary: number;
  sub: number;
  primaryNoun: string;
  subNoun: string;
  hero?: boolean;
}) {
  return (
    <div className={hero ? CARD_HERO : CARD_BASE}>
      <div className={`text-xs uppercase tracking-[0.14em] font-semibold mb-1 ${hero ? 'text-[var(--brand-cyan)]' : 'text-[var(--muted)]'}`}>
        {label}
      </div>
      {range && (
        <div className="text-[10px] num text-[var(--muted)] mb-2">{range}</div>
      )}
      <div className="flex items-baseline gap-3 mb-1">
        <span className={`num font-semibold text-[var(--ink)] ${hero ? 'text-5xl' : 'text-2xl'}`}>
          {formatCount(primary)}
        </span>
        <span className="text-xs text-[var(--muted)]">{primaryNoun}</span>
      </div>
      <div className={`num text-[var(--foreground)] ${hero ? 'text-base' : 'text-sm'}`}>
        {formatCount(sub)}{' '}
        <span className="text-[var(--muted)]">{subNoun}</span>
      </div>
    </div>
  );
}

function RevenueStat({
  label,
  value,
  hero,
  tone,
}: {
  label: string;
  value: string;
  hero?: boolean;
  tone?: 'ok' | 'warn';
}) {
  const valueClass = tone === 'ok'
    ? 'text-emerald-400'
    : tone === 'warn'
    ? 'text-rose-400'
    : 'text-[var(--ink)]';
  return (
    <div>
      <div className={`text-[10px] uppercase tracking-[0.14em] font-semibold mb-1 ${hero ? 'text-[var(--brand-cyan)]' : 'text-[var(--muted)]'}`}>
        {label}
      </div>
      <div className={`num font-semibold ${hero ? 'text-3xl sm:text-4xl' : 'text-lg'} ${valueClass}`}>
        {value}
      </div>
    </div>
  );
}

function RecruitmentCard({
  label,
  reps,
  dealers,
  hero,
}: {
  label: string;
  reps: number;
  dealers: number;
  hero?: boolean;
}) {
  return (
    <div className={hero ? CARD_HERO : CARD_BASE}>
      <div className={`text-xs uppercase tracking-[0.14em] font-semibold mb-3 ${hero ? 'text-[var(--brand-cyan)]' : 'text-[var(--muted)]'}`}>
        {label}
      </div>
      <div className="flex items-baseline gap-3 mb-2">
        <span className={`num font-semibold text-[var(--ink)] ${hero ? 'text-5xl sm:text-6xl' : 'text-3xl'}`}>
          {formatCount(reps)}
        </span>
        <span className="text-sm text-[var(--muted)]">new reps</span>
      </div>
      <div className={`num text-[var(--foreground)] ${hero ? 'text-base' : 'text-sm'}`}>
        {formatCount(dealers)}{' '}
        <span className="text-[var(--muted)]">new dealers</span>
      </div>
    </div>
  );
}

// Build picker options. Always anchor the top option at the most recent
// real-world Sunday — even if the user is viewing a stale ?week= URL
// pointing at a past Sunday. Previously the dropdown started from the
// picker's current value, which meant a bookmark to e.g. ?week=2025-09-14
// locked the dropdown to options going back from Sep 14, 2025 with no
// forward path to today.
function buildWeekOptions(currentEnding: Date, count: number): { value: string; label: string }[] {
  const todaySunday = mostRecentSunday(new Date());
  const top = currentEnding > todaySunday ? currentEnding : todaySunday;
  const options: { value: string; label: string }[] = [];
  const cursor = new Date(top);
  for (let i = 0; i < count; i++) {
    const value = isoDate(cursor);
    options.push({ value, label: `Week ending ${value}` });
    cursor.setDate(cursor.getDate() - 7);
  }
  return options;
}
