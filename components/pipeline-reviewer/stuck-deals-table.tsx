'use client';

import { useMemo, useState } from 'react';
import type { Deal } from '@/lib/pipeline-reviewer/types';

type SortKey = 'daysSinceCreated' | 'daysSinceCleanDeal' | 'daysInStatus' | 'soldSize' | 'soldPpw';

const fmtDays = (n: number | null | undefined) => (n == null ? '—' : `${n.toFixed(0)}d`);
const fmtNum = (n: number) => (n ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—');

function tintFor(days: number | null): string {
  if (days == null) return '';
  if (days >= 180) return 'bg-rose-100/70 dark:bg-rose-950/30';
  if (days >= 90)  return 'bg-rose-50/70  dark:bg-rose-950/20';
  if (days >= 60)  return 'bg-amber-50/80 dark:bg-amber-950/20';
  if (days >= 30)  return 'bg-yellow-50/70 dark:bg-yellow-950/20';
  return 'bg-emerald-50/70 dark:bg-emerald-950/20';
}

export function StuckDealsTable({ deals }: { deals: Deal[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('daysSinceCreated');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');

  const sorted = useMemo(() => {
    const out = deals.slice();
    out.sort((a, b) => {
      const av = (a[sortKey] as number | null) ?? -Infinity;
      const bv = (b[sortKey] as number | null) ?? -Infinity;
      return dir === 'asc' ? av - bv : bv - av;
    });
    return out;
  }, [deals, sortKey, dir]);

  function header(key: SortKey, label: string) {
    const active = sortKey === key;
    return (
      <button
        type="button"
        onClick={() => {
          if (active) setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
          else { setSortKey(key); setDir('desc'); }
        }}
        className={`inline-flex items-center gap-0.5 ${active ? 'text-[var(--ink)]' : 'text-[var(--muted)]'}`}
      >
        {label}
        {active && <span aria-hidden>{dir === 'asc' ? '▲' : '▼'}</span>}
      </button>
    );
  }

  if (deals.length === 0) {
    return <div className="text-sm text-[var(--muted)]">No active deals match the filter.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[64rem]">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-[0.14em] text-[var(--muted)] border-b border-[var(--border)]">
            <th className="py-2 pr-3 font-semibold">Customer</th>
            <th className="py-2 pr-3 font-semibold">Project Status</th>
            <th className="py-2 pr-3 font-semibold">Branch</th>
            <th className="py-2 pr-3 font-semibold">AHJ</th>
            <th className="py-2 pr-3 font-semibold">City</th>
            <th className="py-2 pr-3 font-semibold text-right">{header('daysSinceCreated', 'Since Created')}</th>
            <th className="py-2 pr-3 font-semibold text-right">{header('daysSinceCleanDeal', 'Since Clean Deal')}</th>
            <th className="py-2 pr-3 font-semibold text-right">{header('daysInStatus', 'In Status')}</th>
            <th className="py-2 pr-3 font-semibold text-right">{header('soldSize', 'Sold kW')}</th>
            <th className="py-2 font-semibold text-right">{header('soldPpw', 'Sold $/W')}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((d) => (
            <tr key={d.id || d.fullName} className={`border-b border-[var(--border)] last:border-0 ${tintFor(d.daysSinceCreated)}`}>
              <td className="py-2 pr-3 text-[var(--ink)] whitespace-nowrap">{d.fullName}</td>
              <td className="py-2 pr-3 text-[var(--foreground)]">{d.projectStatus}</td>
              <td className="py-2 pr-3 text-[var(--foreground)]">{d.branch}</td>
              <td className="py-2 pr-3 text-[var(--foreground)]">{d.ahj}</td>
              <td className="py-2 pr-3 text-[var(--muted)]">{d.city}{d.city && d.state ? ', ' : ''}{d.state}</td>
              <td className="py-2 pr-3 text-right num tabular-nums text-[var(--ink)] font-medium">{fmtDays(d.daysSinceCreated)}</td>
              <td className="py-2 pr-3 text-right num tabular-nums text-[var(--muted)]">{fmtDays(d.daysSinceCleanDeal)}</td>
              <td className="py-2 pr-3 text-right num tabular-nums text-[var(--muted)]">{fmtDays(d.daysInStatus)}</td>
              <td className="py-2 pr-3 text-right num tabular-nums text-[var(--muted)]">{fmtNum(d.soldSize)}</td>
              <td className="py-2 text-right num tabular-nums text-[var(--muted)]">{fmtNum(d.soldPpw)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
