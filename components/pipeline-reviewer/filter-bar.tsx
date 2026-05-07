'use client';

import { MultiSelect } from './multi-select';
import type { Filters } from '@/lib/pipeline-reviewer/types';

export function FilterBar({
  options,
  value,
  onChange,
  onReset,
}: {
  options: { organizations: string[]; branches: string[]; utilities: string[]; ahjs: string[] };
  value: Filters;
  onChange: (next: Filters) => void;
  onReset: () => void;
}) {
  const isoOrEmpty = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '');
  const dirty =
    value.salesTeams.length ||
    value.branches.length ||
    value.utilities.length ||
    value.ahjs.length ||
    value.soldFrom ||
    value.soldTo;

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 sm:px-5 py-4 anim-fade-rise">
      <div className="flex flex-wrap items-end gap-3">
        <MultiSelect
          label="Sales Team"
          options={options.organizations}
          value={value.salesTeams}
          onChange={(v) => onChange({ ...value, salesTeams: v })}
        />
        <MultiSelect
          label="Branch"
          options={options.branches}
          value={value.branches}
          onChange={(v) => onChange({ ...value, branches: v })}
        />
        <MultiSelect
          label="Utility"
          options={options.utilities}
          value={value.utilities}
          onChange={(v) => onChange({ ...value, utilities: v })}
        />
        <MultiSelect
          label="AHJ"
          options={options.ahjs}
          value={value.ahjs}
          onChange={(v) => onChange({ ...value, ahjs: v })}
        />
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)] mb-1">
            Sold from
          </label>
          <input
            type="date"
            value={isoOrEmpty(value.soldFrom)}
            onChange={(e) => onChange({ ...value, soldFrom: e.target.value ? new Date(e.target.value) : null })}
            className="px-2 py-2 text-sm rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] focus:border-[var(--brand-cyan)] focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)] mb-1">
            Sold to
          </label>
          <input
            type="date"
            value={isoOrEmpty(value.soldTo)}
            onChange={(e) => onChange({ ...value, soldTo: e.target.value ? new Date(e.target.value) : null })}
            className="px-2 py-2 text-sm rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] focus:border-[var(--brand-cyan)] focus:outline-none"
          />
        </div>
        {dirty ? (
          <button
            type="button"
            onClick={onReset}
            className="text-xs px-3 py-2 rounded-md text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-muted)] self-end"
          >
            Reset filters
          </button>
        ) : null}
      </div>
    </div>
  );
}
