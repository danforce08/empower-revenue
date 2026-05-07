import Link from 'next/link';
import type { ReportMeta } from './reports';

/**
 * Sidebar listing weekly Sales Context reports. Auth-related controls (logout,
 * brand mark) are intentionally absent — the dashboard layout owns those.
 */
export function Sidebar({
  reports,
  current,
}: {
  reports: ReportMeta[];
  current: string;
}) {
  return (
    <aside className="lg:w-64 lg:flex-shrink-0 lg:border-r lg:border-[var(--border)] lg:bg-[var(--surface)]/70 lg:backdrop-blur">
      <div className="lg:sticky lg:top-16 lg:max-h-[calc(100vh-4rem)] lg:overflow-y-auto px-6 py-6 lg:py-8">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] font-semibold text-[var(--brand-cyan)]">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--brand-cyan)] animate-pulse" />
          Sales Context
        </div>

        <nav className="mt-6" aria-label="Past weeks">
          <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--muted)] font-semibold mb-3">
            Weekly reports
          </div>
          <ul className="space-y-1">
            {reports.map((r) => {
              const active = r.slug === current;
              return (
                <li key={r.slug}>
                  <Link
                    href={`/sales-context/${r.slug}`}
                    className={`group block rounded-lg px-3 py-2.5 transition ${
                      active
                        ? 'bg-brand-gradient text-white shadow-md shadow-[var(--brand-navy)]/15'
                        : 'hover:bg-[var(--surface-muted)]'
                    }`}
                  >
                    <div
                      className={`flex items-center gap-2 text-sm font-semibold tabular-nums ${
                        active ? 'text-white' : 'text-[var(--ink)]'
                      }`}
                    >
                      {active && (
                        <span className="inline-block w-1 h-1 rounded-full bg-[var(--brand-cyan)]" />
                      )}
                      {r.week}
                    </div>
                    <div
                      className={`mt-0.5 text-xs ${
                        active ? 'text-white/75' : 'text-[var(--muted)]'
                      }`}
                    >
                      {r.date_range ?? r.slug}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </aside>
  );
}
