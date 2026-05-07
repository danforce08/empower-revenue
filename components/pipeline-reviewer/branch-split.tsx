const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;

export function BranchSplitTable({
  rows,
}: {
  rows: { branch: string; count: number; pct: number }[];
}) {
  if (rows.length === 0) {
    return <div className="text-sm text-[var(--muted)]">No branches in this dataset.</div>;
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-[10px] uppercase tracking-[0.14em] text-[var(--muted)] border-b border-[var(--border)]">
          <th className="py-2 pr-3 font-semibold">Branch</th>
          <th className="py-2 pr-3 font-semibold text-right">Count</th>
          <th className="py-2 font-semibold text-right">% of Total</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.branch} className="border-b border-[var(--border)] last:border-0">
            <td className="py-2 pr-3 text-[var(--ink)]">{r.branch}</td>
            <td className="py-2 pr-3 text-right num tabular-nums">{r.count.toLocaleString()}</td>
            <td className="py-2 text-right num tabular-nums text-[var(--muted)]">{fmtPct(r.pct)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
