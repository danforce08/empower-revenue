'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export type TrendPoint = {
  week: string;        // YYYY-MM-DD (Monday)
  value: number;
  label?: string;      // formatted week range, e.g. "Apr 14 → Apr 20"
};

export function ChannelTrendChart({
  data,
  target,
  metricLabel,
}: {
  data: TrendPoint[];
  target?: number;
  metricLabel: string;
}) {
  if (data.length === 0) {
    return (
      <div className="px-6 py-12 text-sm text-[var(--muted)] text-center">
        No history yet — chart fills in after the first weekly entry.
      </div>
    );
  }

  return (
    <div className="px-4 pt-3 pb-4 h-72">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 12, right: 16, bottom: 4, left: -12 }}>
          <defs>
            <linearGradient id="cyanFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00B8F3" stopOpacity={0.32} />
              <stop offset="100%" stopColor="#00B8F3" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: 'var(--muted)' }}
            tickLine={false}
            axisLine={{ stroke: 'var(--border)' }}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 11, fill: 'var(--muted)' }}
            tickLine={false}
            axisLine={false}
            width={40}
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ stroke: 'var(--brand-cyan)', strokeWidth: 1, strokeDasharray: '3 3' }}
            contentStyle={{
              background: 'var(--surface-glass-strong)',
              backdropFilter: 'blur(8px)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              fontSize: 12,
              boxShadow: '0 8px 24px -8px rgba(10,24,40,0.18)',
              color: 'var(--foreground)',
            }}
            labelStyle={{ color: 'var(--brand-navy)', fontWeight: 600 }}
            formatter={(value: unknown) =>
              [String(value), metricLabel] as [string, string]
            }
          />
          {target ? (
            <ReferenceLine
              y={target}
              stroke="var(--brand-navy)"
              strokeDasharray="4 4"
              strokeOpacity={0.5}
              label={{ value: `target ${target}`, position: 'right', fill: 'var(--muted)', fontSize: 10 }}
            />
          ) : null}
          <Area
            type="monotone"
            dataKey="value"
            stroke="#00B8F3"
            strokeWidth={2}
            fill="url(#cyanFill)"
            activeDot={{ r: 4, fill: '#00B8F3', stroke: 'var(--surface)', strokeWidth: 2 }}
            isAnimationActive
            animationDuration={500}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
