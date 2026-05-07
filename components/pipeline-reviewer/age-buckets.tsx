const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;

const TINTS = [
  'bg-emerald-500',
  'bg-lime-500',
  'bg-amber-500',
  'bg-orange-500',
  'bg-rose-600',
];

export function AgeBuckets({
  rows,
}: {
  rows: { label: string; count: number; pct: number }[];
}) {
  const total = rows.reduce((a, b) => a + b.count, 0);
  if (total === 0) {
    return <div className="text-sm text-[var(--muted)]">No active deals match the filter.</div>;
  }
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-[var(--surface-muted)]">
        {rows.map((r, i) => (
          <div
            key={r.label}
            className={`${TINTS[i] ?? 'bg-slate-400'} transition-[width] duration-200`}
            style={{ width: `${r.pct * 100}%` }}
            title={`${r.label}: ${r.count} (${fmtPct(r.pct)})`}
          />
        ))}
      </div>
      <ul className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-2 text-sm">
        {rows.map((r, i) => (
          <li key={r.label} className="rounded-lg border border-[var(--border)] px-3 py-2">
            <div className="flex items-center gap-1.5">
              <span className={`inline-block w-2 h-2 rounded-full ${TINTS[i] ?? 'bg-slate-400'}`} />
              <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">{r.label}</span>
            </div>
            <div className="mt-1 num tabular-nums text-[var(--ink)] font-semibold">{r.count.toLocaleString()}</div>
            <div className="num tabular-nums text-xs text-[var(--muted)]">{fmtPct(r.pct)}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
