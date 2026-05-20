'use client';

import { usePathname, useRouter } from 'next/navigation';
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
  const [pending, start] = useTransition();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const v = e.target.value;
    start(() => {
      // Stay on the current page when changing the picker. Previously
      // this hard-coded `/?week=...`, which kicked /dashboard users
      // back to the Weekly Review.
      router.push(`${pathname}?week=${v}`);
    });
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
    </div>
  );
}
