import type { IqrStats } from '@/lib/pipeline-reviewer/compute';

const fmtDays = (n: number | null) => (n == null ? '—' : `${n.toFixed(1)}d`);

export function CycleTimeTable({
  rows,
}: {
  rows: ({ label: string } & IqrStats)[];
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-[10px] uppercase tracking-[0.14em] text-[var(--muted)] border-b border-[var(--border)]">
          <th className="py-2 pr-3 font-semibold">Stage Transition</th>
          <th className="py-2 pr-3 font-semibold text-right">Median</th>
          <th className="py-2 pr-3 font-semibold text-right">Q1</th>
          <th className="py-2 pr-3 font-semibold text-right">Q3</th>
          <th className="py-2 font-semibold text-right">Count</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} className="border-b border-[var(--border)] last:border-0">
            <td className="py-2 pr-3 text-[var(--ink)]">{r.label}</td>
            <td className="py-2 pr-3 text-right num tabular-nums">{fmtDays(r.median)}</td>
            <td className="py-2 pr-3 text-right num tabular-nums text-[var(--muted)]">{fmtDays(r.q1)}</td>
            <td className="py-2 pr-3 text-right num tabular-nums text-[var(--muted)]">{fmtDays(r.q3)}</td>
            <td className="py-2 text-right num tabular-nums text-[var(--muted)]">{r.count.toLocaleString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
