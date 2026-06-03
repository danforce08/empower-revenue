'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';

export type Basis = 'sold' | 'installed';

/**
 * Segmented Sold ↔ Installed control. Sets the `?basis=` query param (omitted
 * when 'sold', the default) and preserves every other param (e.g. `week`).
 * Mirrors components/week-picker.tsx's navigation pattern so the two controls
 * behave consistently.
 */
export function BasisToggle({ current }: { current: Basis }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, start] = useTransition();

  function setBasis(next: Basis) {
    if (next === current) return;
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'sold') params.delete('basis');
    else params.set('basis', next);
    const qs = params.toString();
    start(() => router.push(qs ? `${pathname}?${qs}` : pathname));
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-[var(--muted)] uppercase tracking-wide">Measure by</span>
      <div
        role="group"
        aria-label="Date basis"
        className="inline-flex items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] p-0.5 shadow-sm"
      >
        <BasisButton
          label="Sold date"
          active={current === 'sold'}
          disabled={pending}
          onClick={() => setBasis('sold')}
        />
        <BasisButton
          label="Installed date"
          active={current === 'installed'}
          disabled={pending}
          onClick={() => setBasis('installed')}
        />
      </div>
    </div>
  );
}

function BasisButton({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-cyan)] disabled:opacity-50 ${
        active
          ? 'bg-[var(--brand-cyan)] text-white shadow-sm'
          : 'text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-muted)]'
      }`}
    >
      {label}
    </button>
  );
}
