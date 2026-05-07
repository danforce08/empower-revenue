const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;

export function FunnelChart({
  rows,
}: {
  rows: { label: string; count: number; pct: number }[];
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[minmax(11rem,15rem)_1fr_auto_auto] items-center gap-3 text-sm">
          <div className="text-[var(--ink)] truncate">{r.label}</div>
          <div className="h-5 rounded bg-[var(--surface-muted)] overflow-hidden">
            <div
              className="h-full bg-[var(--brand-cyan)] transition-[width] duration-200"
              style={{ width: `${(r.count / max) * 100}%` }}
            />
          </div>
          <div className="num text-[var(--ink)] tabular-nums w-12 text-right">{r.count.toLocaleString()}</div>
          <div className="num text-[var(--muted)] tabular-nums w-14 text-right">{fmtPct(r.pct)}</div>
        </div>
      ))}
    </div>
  );
}
