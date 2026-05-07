'use client';

import { useMemo } from 'react';
import { isoDate, mostRecentSunday, weekStart } from '@/lib/periods';

/**
 * Controlled week dropdown for forms. The value is the **Monday-start** ISO
 * date of the chosen week (matches our metrics row's `period_start`). Option
 * labels are formatted week ranges like "Apr 14 → Apr 20, 2026" with friendly
 * tags ("This week" / "Last week") for the most recent two.
 */
export function WeekSelect({
  value,
  onChange,
  className = '',
  count = 26,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  count?: number;
}) {
  const options = useMemo(() => buildOptions(count), [count]);

  // If the current value isn't in the options (e.g. very old week), prepend it
  // so the select still reflects state.
  const hasCurrent = options.some((o) => o.value === value);
  const allOptions = hasCurrent ? options : [{ value, label: value, tag: undefined }, ...options];

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={
        'w-full px-3 py-2.5 border border-[var(--border-strong)] rounded-lg text-sm bg-[var(--surface)] focus:border-[var(--brand-cyan)] focus:outline-none transition-colors num cursor-pointer ' +
        className
      }
    >
      {allOptions.map((o) => (
        <option key={o.value} value={o.value}>
          {o.tag ? `${o.tag} · ${o.label}` : o.label}
        </option>
      ))}
    </select>
  );
}

type Opt = { value: string; label: string; tag?: string };

function buildOptions(count: number): Opt[] {
  const today = new Date();
  const todaySunday = mostRecentSunday(today);
  const todayMonday = weekStart(todaySunday); // Monday of current week
  const todayIso = isoDate(todayMonday);

  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const out: Opt[] = [];
  // Cursor walks backward from this Monday in 7-day steps
  const cursor = new Date(todayMonday);
  for (let i = 0; i < count; i++) {
    const monday = new Date(cursor);
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    const value = isoDate(monday);
    const sameYear = monday.getFullYear() === sunday.getFullYear();
    const label =
      `${fmt(monday)} → ${fmt(sunday)}` +
      (sameYear ? `, ${sunday.getFullYear()}` : ` ${sunday.getFullYear()}`);
    let tag: string | undefined;
    if (value === todayIso) tag = 'This week';
    else if (i === 1) tag = 'Last week';
    out.push({ value, label, tag });
    cursor.setDate(cursor.getDate() - 7);
  }
  return out;
}
