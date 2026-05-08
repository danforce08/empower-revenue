'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

// Cool/teal-leaning palette so the chart reads in the same family as the
// site's brand cyan. Top of the palette is the most saturated, fading to
// muted as we hit the long tail of small orgs.
const PALETTE = [
  '#00B8F3', // brand cyan
  '#0EA5E9',
  '#22D3EE',
  '#06B6D4',
  '#3B82F6',
  '#6366F1',
  '#8B5CF6',
  '#A855F7',
  '#14B8A6',
  '#0891B2',
  '#1D4ED8',
  '#7C3AED',
  '#94A3B8', // "Other" — slate
];

export type ActiveRepsChartProps = {
  title: string;
  subtitle?: string;
  /**
   * One row per month with a `month` label plus one numeric field per
   * org in `orgs`. The chart renders a stacked Bar per org.
   */
  data: Array<Record<string, string | number>>;
  /** Org keys to render as stacked Bars, top contributor first. */
  orgs: string[];
  summary: { lastMonth: number; thisMonth: number; ytd: number };
};

export function ActiveRepsChart({
  title,
  subtitle,
  data,
  orgs,
  summary,
}: ActiveRepsChartProps) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_1px_2px_rgba(10,24,40,0.04),0_8px_24px_-12px_rgba(10,24,40,0.08)]">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-[var(--ink)]">{title}</h3>
        {subtitle && (
          <p className="text-xs text-[var(--muted)] mt-0.5">{subtitle}</p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <SummaryStat label="Last Month" value={summary.lastMonth} />
        <SummaryStat label="This Month" value={summary.thisMonth} />
        <SummaryStat label="YTD" value={summary.ytd} hero />
      </div>

      <div className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 11, fill: 'var(--muted)' }}
              tickLine={false}
              axisLine={{ stroke: 'var(--border)' }}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 11, fill: 'var(--muted)' }}
              tickLine={false}
              axisLine={false}
              width={32}
            />
            <Tooltip
              cursor={{ fill: 'var(--surface-muted)', opacity: 0.6 }}
              contentStyle={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                fontSize: 12,
                color: 'var(--ink)',
              }}
              labelStyle={{ color: 'var(--ink)', fontWeight: 600 }}
              itemStyle={{ color: 'var(--foreground)' }}
            />
            {orgs.map((org, i) => (
              <Bar
                key={org}
                dataKey={org}
                stackId="orgs"
                fill={PALETTE[i] ?? PALETTE[PALETTE.length - 1]}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {orgs.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
          {orgs.map((org, i) => (
            <div key={org} className="flex items-center gap-1.5 text-xs text-[var(--foreground)]">
              <span
                className="inline-block w-2.5 h-2.5 rounded-sm"
                style={{ background: PALETTE[i] ?? PALETTE[PALETTE.length - 1] }}
              />
              <span className="truncate max-w-[12rem]">{org}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryStat({
  label,
  value,
  hero,
}: { label: string; value: number; hero?: boolean }) {
  return (
    <div
      className={`rounded-lg border px-3 py-2 ${
        hero ? 'border-[var(--brand-cyan-soft)]' : 'border-[var(--border)]'
      }`}
    >
      <div className="text-[10px] uppercase tracking-[0.14em] font-semibold text-[var(--muted)]">
        {label}
      </div>
      <div
        className={`num font-semibold text-[var(--ink)] ${
          hero ? 'text-2xl' : 'text-xl'
        }`}
      >
        {value.toLocaleString()}
      </div>
    </div>
  );
}
