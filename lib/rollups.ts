import type { Channel, MetricRow, SourceOfTruth } from './types';

/**
 * Per-channel system of record. For channels Jobflo populates, manual entries
 * are dropped before the rollup so the two sources don't double-count. HVAC has
 * no Jobflo signal so manual is the only source.
 */
const PREFERRED_SOURCE: Record<string, SourceOfTruth> = {
  total_sales: 'jobflo_upload',
  roof: 'jobflo_upload',
  battery_only: 'jobflo_upload',
  internal: 'jobflo_upload',
  dealer: 'jobflo_upload',
  // hvac: previously manual_entry only. Now Jobflo also emits HVAC via the
  // Adders-sheet detection, so leave HVAC unfiltered so both sources count.
  // Risk: if data lands in both Jobflo and manual for the same week, the
  // numbers add. Acceptable until we know which path is canonical.
};

function filterToPreferredSource(rows: MetricRow[], channel: Channel): MetricRow[] {
  const preferred = PREFERRED_SOURCE[channel.key];
  if (!preferred) return rows;
  return rows.filter((r) => r.source_of_truth === preferred);
}

/**
 * Sum each `metrics_schema[].key` across the given rows. Rows with
 * `excluded_from_kpi = true` are skipped, and rows from the wrong source for
 * the channel are filtered out per `PREFERRED_SOURCE`.
 *
 * Also unions any array-typed fields (e.g. `unique_reps`, `recruited_reps`,
 * `recruited_orgs`) so distinct-count metrics stay correct across periods.
 */
export function rollupMetrics(
  rows: MetricRow[],
  channel: Channel,
): Record<string, number | string[]> {
  const filtered = filterToPreferredSource(rows, channel);
  const result: Record<string, number | string[]> = {};
  for (const field of channel.metrics_schema) result[field.key] = 0;

  // Sets backing union'd array fields, indexed by metric key.
  const sets = new Map<string, Set<string>>();

  for (const row of filtered) {
    if (row.excluded_from_kpi) continue;
    const m = row.metrics ?? {};
    for (const [key, v] of Object.entries(m)) {
      if (typeof v === 'number' && Number.isFinite(v)) {
        const cur = typeof result[key] === 'number' ? (result[key] as number) : 0;
        result[key] = cur + v;
      } else if (Array.isArray(v)) {
        let s = sets.get(key);
        if (!s) {
          s = new Set<string>();
          sets.set(key, s);
        }
        for (const item of v) if (typeof item === 'string' && item) s.add(item);
      }
    }
  }

  for (const [key, s] of sets) {
    result[key] = Array.from(s).sort();
  }
  return result;
}

/**
 * Filter rows whose bucket OVERLAPS `[start, end]` inclusive. Weekly buckets
 * that span a month / quarter / year boundary still count toward both periods —
 * over-counting boundary weeks is preferable to silently dropping them, which
 * is what a strict `period_start >= start` filter does.
 */
export function rowsInRange(rows: MetricRow[], start: string, end: string): MetricRow[] {
  return rows.filter((r) => r.period_end >= start && r.period_start <= end);
}

const ONE_DAY_MS = 86_400_000;

/** Proration weight for a bucket spanning [bucketStart, bucketEnd] against a
 * window [start, end]. Returns 0..1 — useful for "what fraction of this
 * week's activity actually falls inside MTD?" */
export function bucketWeight(
  bucketStart: string,
  bucketEnd: string,
  start: string,
  end: string,
): number {
  const a = bucketStart > start ? bucketStart : start;
  const b = bucketEnd < end ? bucketEnd : end;
  if (a > b) return 0;
  const overlap = (Date.parse(b) - Date.parse(a)) / ONE_DAY_MS + 1;
  const total = (Date.parse(bucketEnd) - Date.parse(bucketStart)) / ONE_DAY_MS + 1;
  if (total <= 0) return 0;
  const w = overlap / total;
  return w < 0 ? 0 : w > 1 ? 1 : w;
}

/**
 * Prorated rollup. Numeric fields are weighted by per-bucket overlap with
 * `[start, end]` so a 7-day bucket that only intersects MTD by 3 days
 * contributes 3/7 of its values. Array fields (`unique_reps`, etc.) are
 * still unioned as-is — set membership doesn't fractionalize.
 *
 * Use this for any cumulative period card (MTD / QTD / YTD); use the plain
 * `rollupMetrics` for fixed-week cards where the period IS the bucket.
 */
export function rollupMetricsProrated(
  rows: MetricRow[],
  channel: Channel,
  start: string,
  end: string,
): Record<string, number | string[]> {
  const result: Record<string, number | string[]> = {};
  for (const field of channel.metrics_schema) result[field.key] = 0;
  const sets = new Map<string, Set<string>>();

  for (const row of rows) {
    if (row.excluded_from_kpi) continue;
    const w = bucketWeight(row.period_start, row.period_end, start, end);
    if (w <= 0) continue;
    // Reuse the source-of-truth filter from rollupMetrics by going through
    // it on a single-row basis.
    const single = rollupMetrics([row], channel);
    for (const [key, v] of Object.entries(single)) {
      if (typeof v === 'number' && Number.isFinite(v)) {
        const cur = typeof result[key] === 'number' ? (result[key] as number) : 0;
        result[key] = cur + v * w;
      } else if (Array.isArray(v)) {
        let s = sets.get(key);
        if (!s) { s = new Set<string>(); sets.set(key, s); }
        for (const item of v) if (typeof item === 'string' && item) s.add(item);
      }
    }
  }
  for (const [key, s] of sets) result[key] = Array.from(s).sort();
  return result;
}

/** Sum a single key across an arbitrary metric set (used for footer totals). */
export function sumKey(metrics: Record<string, number | string[]>, key: string): number {
  const v = metrics[key];
  return typeof v === 'number' ? v : 0;
}

/** Distinct-count from an array-valued metric (e.g. `unique_reps`). */
export function countKey(metrics: Record<string, number | string[]>, key: string): number {
  const v = metrics[key];
  return Array.isArray(v) ? v.length : 0;
}
