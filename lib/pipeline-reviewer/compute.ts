import { AGE_BUCKETS, FUNNEL_STAGES, STAGES, type StageKey } from './constants';
import type { Deal } from './types';

export type IqrStats = { median: number | null; q1: number | null; q3: number | null; count: number };

export function percentileLinear(sortedAsc: number[], p: number): number | null {
  const n = sortedAsc.length;
  if (n === 0) return null;
  if (n === 1) return sortedAsc[0];
  const h = (n - 1) * (p / 100);
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  return sortedAsc[lo] + (h - lo) * (sortedAsc[hi] - sortedAsc[lo]);
}

export function iqrStats(values: (number | null | undefined)[]): IqrStats {
  const sorted = values
    .filter((v): v is number => v != null && Number.isFinite(v) && v >= 0)
    .sort((a, b) => a - b);
  return {
    median: percentileLinear(sorted, 50),
    q1: percentileLinear(sorted, 25),
    q3: percentileLinear(sorted, 75),
    count: sorted.length,
  };
}

export function kpis(deals: Deal[]) {
  let total = 0, active = 0, cancelled = 0, completed = 0, stuck = 0, installed = 0, pto = 0;
  for (const d of deals) {
    total++;
    if (d.isActive) active++;
    if (d.isCancelled) cancelled++;
    if (d.isCompleted) completed++;
    if (d.isStuck) stuck++;
    if (d.installCompletedAt) installed++;
    if (d.ptoReceivedAt) pto++;
  }
  return { total, active, cancelled, completed, stuck, installed, pto };
}

export function funnel(deals: Deal[]) {
  const total = deals.length;
  return FUNNEL_STAGES.map((s) => {
    const count = s.field == null
      ? total
      : deals.filter((d) => (d as unknown as Record<string, Date | null>)[s.field as string]).length;
    return { label: s.label, count, pct: total ? count / total : 0 };
  });
}

export function branchSplit(deals: Deal[]) {
  const map = new Map<string, number>();
  for (const d of deals) {
    if (!d.branch) continue;
    map.set(d.branch, (map.get(d.branch) ?? 0) + 1);
  }
  const total = deals.length;
  return Array.from(map.entries())
    .map(([branch, count]) => ({ branch, count, pct: total ? count / total : 0 }))
    .sort((a, b) => b.count - a.count);
}

export function ageBuckets(deals: Deal[]) {
  const active = deals.filter((d) => d.isActive && d.daysSinceCreated != null);
  const buckets = AGE_BUCKETS.map((b) => ({ ...b, count: 0 }));
  for (const d of active) {
    const days = d.daysSinceCreated as number;
    for (const b of buckets) {
      if (days < b.max) { b.count++; break; }
      if (b.max === Infinity) { b.count++; break; }
    }
  }
  const total = active.length;
  return buckets.map((b) => ({ label: b.label, count: b.count, pct: total ? b.count / total : 0 }));
}

export function cycleTime(deals: Deal[]) {
  return STAGES.map((s) => {
    const stats = iqrStats(deals.map((d) => d.stageDurations[s.label as StageKey]));
    return { label: s.label, ...stats };
  });
}

export function projectStatusCounts(deals: Deal[]) {
  const map = new Map<string, number[]>();
  for (const d of deals) {
    const k = d.projectStatus || '(blank)';
    if (!map.has(k)) map.set(k, []);
    if (d.daysInStatus != null) (map.get(k) as number[]).push(d.daysInStatus);
  }
  const total = deals.length;
  return Array.from(map.entries())
    .map(([status, days]) => {
      const sorted = days.slice().sort((a, b) => a - b);
      const median = percentileLinear(sorted, 50);
      const max = sorted.length ? sorted[sorted.length - 1] : null;
      const count = deals.filter((d) => (d.projectStatus || '(blank)') === status).length;
      return {
        status, count,
        pct: total ? count / total : 0,
        medianDays: median,
        maxDays: max,
      };
    })
    .sort((a, b) => b.count - a.count);
}

export type TimelineRow = {
  key: string;
  count: number;
  stages: Record<StageKey, IqrStats>;
  completionPct: number;
};

function timelineGroup(deals: Deal[], pickKey: (d: Deal) => string, opts: TimelineOpts, asOf: Date): TimelineRow[] {
  const filtered = applyTimelineDateFilter(deals, opts, asOf);
  const groups = new Map<string, Deal[]>();
  for (const d of filtered) {
    const k = pickKey(d) || '(blank)';
    if (!groups.has(k)) groups.set(k, []);
    (groups.get(k) as Deal[]).push(d);
  }
  return Array.from(groups.entries())
    .map(([key, list]) => {
      const stages = {} as Record<StageKey, IqrStats>;
      for (const s of STAGES) {
        stages[s.label as StageKey] = iqrStats(list.map((d) => d.stageDurations[s.label as StageKey]));
      }
      const installs = list.filter((d) => d.installStartAt).length;
      return {
        key,
        count: list.length,
        stages,
        completionPct: list.length ? installs / list.length : 0,
      };
    })
    .sort((a, b) => b.count - a.count);
}

export type TimelineOpts = {
  recencyExclusionDays: number;  // 0 = none
  startDate: Date | null;        // Clean Deal >=
  endDate: Date | null;          // Clean Deal <=
};

function applyTimelineDateFilter(deals: Deal[], opts: TimelineOpts, asOf: Date): Deal[] {
  return deals.filter((d) => {
    if (!d.cleanDealAt) return false;
    const t = d.cleanDealAt.getTime();
    if (opts.recencyExclusionDays > 0) {
      const cutoff = asOf.getTime() - opts.recencyExclusionDays * 86_400_000;
      if (t > cutoff) return false;
    }
    if (opts.startDate && t < opts.startDate.getTime()) return false;
    if (opts.endDate && t > opts.endDate.getTime() + 86_399_999) return false;
    return true;
  });
}

export function byAhj(deals: Deal[], opts: TimelineOpts, asOf: Date): TimelineRow[] {
  return timelineGroup(deals, (d) => d.ahj, opts, asOf);
}

export function byBranch(deals: Deal[], opts: TimelineOpts, asOf: Date): TimelineRow[] {
  return timelineGroup(deals, (d) => d.branch, opts, asOf);
}

/**
 * Truly stuck deals — `isActive` AND `daysSinceCreated >= STUCK_DAYS`
 * (180 by default). Matches the "Stuck (180+)" KPI at the top of the
 * page; previously this returned every active deal regardless of age,
 * so the bottom of the list always showed 125–130d deals that weren't
 * actually stuck.
 */
export function stuckDeals(deals: Deal[]) {
  return deals
    .filter((d) => d.isStuck)
    .slice()
    .sort((a, b) => (b.daysSinceCreated ?? 0) - (a.daysSinceCreated ?? 0));
}
