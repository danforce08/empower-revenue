type KpiTone = 'default' | 'good' | 'bad' | 'warn';

const TONE: Record<KpiTone, string> = {
  default: 'text-[var(--ink)]',
  good:    'text-emerald-700',
  bad:     'text-rose-700',
  warn:    'text-amber-700',
};

export function KpiGrid({
  items,
}: {
  items: { label: string; value: number; tone?: KpiTone }[];
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
      {items.map((it) => (
        <div
          key={it.label}
          className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3"
        >
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
            {it.label}
          </div>
          <div className={`mt-1 text-2xl font-semibold tracking-tight num ${TONE[it.tone ?? 'default']}`}>
            {it.value.toLocaleString()}
          </div>
        </div>
      ))}
    </div>
  );
}
