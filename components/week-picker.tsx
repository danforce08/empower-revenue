'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';

type Option = {
  /** Sunday-ending ISO date (the value bound to ?week=) */
  value: string;
  /** Human label, e.g. "Apr 27 → May 3, 2026" */
  label: string;
  /** Friendly relative tag, e.g. "Last week" / "This week" */
  tag?: string;
};

export function WeekPicker({
  current,
  options,
}: {
  current: string;
  options: Option[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, start] = useTransition();
  // True iff the user has explicitly picked a week (?week= in URL).
  // We show a reset (×) button only in this case — when picker is at
  // its default, there's nothing to reset to.
  const hasExplicitPick = !!searchParams.get('week');

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const v = e.target.value;
    start(() => {
      router.push(`${pathname}?week=${v}`);
    });
  }

  function onReset() {
    start(() => router.push(pathname));
  }

  return (
    <div className="flex items-center gap-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-sm pr-1">
      <label htmlFor="week" className="text-xs text-[var(--muted)] uppercase tracking-wide pl-3">
        Week ending
      </label>
      <select
        id="week"
        value={current}
        onChange={onChange}
        disabled={pending}
        className="num text-sm text-[var(--foreground)] bg-transparent border-0 focus:outline-none py-2 pr-2 cursor-pointer disabled:opacity-50"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.tag ? `${o.tag} · ${o.label}` : o.label}
          </option>
        ))}
      </select>
      {hasExplicitPick && (
        <button
          type="button"
          onClick={onReset}
          disabled={pending}
          aria-label="Reset to default week"
          title="Reset to default (latest week)"
          className="inline-flex items-center justify-center w-6 h-6 rounded-md text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-muted)] transition-colors disabled:opacity-50 -ml-1"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="18" y1="6" x2="6" y2="18" />
          </svg>
        </button>
      )}
    </div>
  );
}
