const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;
const fmtDays = (n: number | null) => (n == null ? '—' : `${n.toFixed(1)}d`);

export function StatusDistribution({
  rows,
}: {
  rows: { status: string; count: number; pct: number; medianDays: number | null; maxDays: number | null }[];
}) {
  if (rows.length === 0) {
    return <div className="text-sm text-[var(--muted)]">No deals match the filter.</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[34rem]">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-[0.14em] text-[var(--muted)] border-b border-[var(--border)]">
            <th className="py-2 pr-3 font-semibold">Project Status</th>
            <th className="py-2 pr-3 font-semibold text-right">Count</th>
            <th className="py-2 pr-3 font-semibold text-right">% of Pipeline</th>
            <th className="py-2 pr-3 font-semibold text-right">Median Days</th>
            <th className="py-2 font-semibold text-right">Max Days</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.status} className="border-b border-[var(--border)] last:border-0">
              <td className="py-2 pr-3 text-[var(--ink)]">{r.status}</td>
              <td className="py-2 pr-3 text-right num tabular-nums">{r.count.toLocaleString()}</td>
              <td className="py-2 pr-3 text-right num tabular-nums text-[var(--muted)]">{fmtPct(r.pct)}</td>
              <td className="py-2 pr-3 text-right num tabular-nums text-[var(--muted)]">{fmtDays(r.medianDays)}</td>
              <td className="py-2 text-right num tabular-nums text-[var(--muted)]">{fmtDays(r.maxDays)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
