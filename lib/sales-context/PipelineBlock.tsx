import type { PipelineData } from './reports';

function StatCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: "cyan" | "navy" | "muted";
}) {
  const accentBar =
    accent === "navy"
      ? "bg-[color:var(--color-brand-navy)]"
      : accent === "muted"
        ? "bg-[color:var(--color-border)]"
        : "bg-[color:var(--color-brand-cyan)]";

  return (
    <div className="lift relative overflow-hidden flex flex-col rounded-xl border border-[color:var(--color-border)] bg-white p-5">
      <span
        aria-hidden
        className={`absolute left-0 top-0 h-full w-1 ${accentBar}`}
      />
      <div className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-muted)] font-semibold">
        {label}
      </div>
      <div className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-[color:var(--color-brand-navy)]">
        {value}
      </div>
      {hint && (
        <div className="mt-1 text-xs text-[color:var(--color-muted)]">
          {hint}
        </div>
      )}
    </div>
  );
}

export function PipelineBlock({ data }: { data: PipelineData }) {
  const reps = data.reps_onboarded_new_to_empower;
  const dealerOrgs = data.reps_by_dealer_org ?? {};
  const newApps = data.new_dealer_applications_submitted;
  const newDealers = data.new_dealers_onboarded;
  const states = data.rep_state_volume ?? {};
  const stateMax = Math.max(1, ...Object.values(states));

  const dealerEntries = Object.entries(dealerOrgs).sort(
    (a, b) => b[1] - a[1],
  );
  const topDealer = dealerEntries[0];

  return (
    <section
      id="pipeline"
      aria-labelledby="pipeline-heading"
      className="mb-12 animate-fade-up"
    >
      <div className="flex items-baseline justify-between mb-4">
        <h2
          id="pipeline-heading"
          className="text-[11px] uppercase tracking-[0.2em] text-[color:var(--color-brand-cyan)] font-semibold"
        >
          Pipeline
        </h2>
        {topDealer && (
          <div className="text-xs text-[color:var(--color-muted)]">
            Lead dealer ·{" "}
            <span className="font-semibold text-[color:var(--color-brand-navy)]">
              {topDealer[0]}
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard
          label="Reps · new to Empower"
          value={reps ?? "—"}
          hint={
            dealerEntries.length > 0
              ? `${dealerEntries.length} dealer org${dealerEntries.length === 1 ? "" : "s"}`
              : undefined
          }
          accent="cyan"
        />
        <StatCard
          label="New dealer applications"
          value={newApps ?? "—"}
          hint={
            data.most_recent_dealer_application
              ? `Most recent: ${data.most_recent_dealer_application}`
              : undefined
          }
          accent="navy"
        />
        <StatCard
          label="New dealers onboarded"
          value={newDealers ?? "—"}
          hint={
            data.most_recent_dealer_onboarded
              ? `Most recent: ${data.most_recent_dealer_onboarded}`
              : undefined
          }
          accent="navy"
        />
      </div>

      {dealerEntries.length > 0 && (
        <div className="lift mt-4 rounded-xl border border-[color:var(--color-border)] bg-white p-5">
          <div className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-muted)] font-semibold mb-3">
            Reps by dealer org
          </div>
          <div className="flex flex-wrap gap-2">
            {dealerEntries.map(([name, count], i) => {
              const isTop = i === 0;
              return (
                <span
                  key={name}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm transition ${
                    isTop
                      ? "border-[color:var(--color-brand-cyan)] bg-[color:var(--color-brand-cyan-soft)] text-[color:var(--color-brand-navy)]"
                      : "border-[color:var(--color-border)] bg-[color:var(--color-bg-tint)] text-[color:var(--color-fg)]"
                  }`}
                >
                  <span className="font-semibold">{name}</span>
                  <span
                    className={`tabular-nums ${
                      isTop
                        ? "text-[color:var(--color-brand-navy)] font-bold"
                        : "text-[color:var(--color-muted)]"
                    }`}
                  >
                    {count}
                  </span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {Object.keys(states).length > 0 && (
        <div className="lift mt-3 rounded-xl border border-[color:var(--color-border)] bg-white p-5">
          <div className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-muted)] font-semibold mb-3">
            Where rep volume will come in
          </div>
          <div className="space-y-2.5">
            {Object.entries(states)
              .sort((a, b) => b[1] - a[1])
              .map(([state, count]) => {
                const pct = (count / stateMax) * 100;
                return (
                  <div key={state} className="flex items-center gap-3">
                    <div className="w-10 text-sm font-bold tabular-nums text-[color:var(--color-brand-navy)]">
                      {state}
                    </div>
                    <div className="flex-1 h-2.5 rounded-full bg-[color:var(--color-bg-tint)] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[color:var(--color-brand-navy)] to-[color:var(--color-brand-cyan)] transition-[width] duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="w-8 text-right text-sm tabular-nums text-[color:var(--color-muted)]">
                      {count}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </section>
  );
}
