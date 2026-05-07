/**
 * Period helpers. Weeks are Monday-anchored (Mon → Sun inclusive).
 * All dates are interpreted in local time and formatted as YYYY-MM-DD.
 */

export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseIsoDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Monday at the start of the week containing `d`. */
export function weekStart(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = x.getDay(); // 0=Sun, 1=Mon, ...
  const diff = day === 0 ? -6 : 1 - day; // back up to Monday
  x.setDate(x.getDate() + diff);
  return x;
}

export function weekEnd(d: Date): Date {
  const start = weekStart(d);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return end;
}

export function monthStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function monthEnd(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

export function quarterStart(d: Date): Date {
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), q * 3, 1);
}

export function quarterEnd(d: Date): Date {
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), q * 3 + 3, 0);
}

export function yearStart(d: Date): Date {
  return new Date(d.getFullYear(), 0, 1);
}

/** Sunday closest to or before `today` (used as the default "week ending"). */
export function mostRecentSunday(today = new Date()): Date {
  const x = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const day = x.getDay();
  if (day === 0) return x;
  x.setDate(x.getDate() - day);
  return x;
}

export function previousWeek(weekStarting: Date): { start: Date; end: Date } {
  const start = new Date(weekStarting);
  start.setDate(start.getDate() - 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { start, end };
}
