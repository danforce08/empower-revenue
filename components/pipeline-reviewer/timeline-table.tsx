'use client';

import { useState } from 'react';
import { STAGES, type StageKey } from '@/lib/pipeline-reviewer/constants';
import type { IqrStats, TimelineOpts, TimelineRow } from '@/lib/pipeline-reviewer/compute';

const fmtDays = (n: number | null | undefined) => (n == null ? '—' : `${n.toFixed(1)}d`);
const fmtPct = (n: number) => `${(n * 100).toFixed(0)}%`;

const SHORT: Record<StageKey, string> = {
  'Created → Clean Deal':                       'Cr → Clean',
  'Clean Deal → Site Survey Completed':         'Clean → Survey',
  'Site Survey Completed → Design Completed':   'Survey → Design',
  'Design Completed → Permit Submitted':        'Design → Permit Sub',
  'Permit Submitted → Approved':                'Permit Sub → Appr',
  'Permit Approved → Install Scheduled':        'Permit Appr → Sched',
  'Install Scheduled → Install Start':          'Sched → Start',
};

export function TimelineTable({
  groupLabel,
  rows,
  opts,
  onOptsChange,
}: {
  groupLabel: string;
  rows: TimelineRow[];
  opts: TimelineOpts;
  onOptsChange: (next: TimelineOpts) => void;
}) {
  const [collapsed, setCollapsed] = useState(rows.length > 20);
  const visible = collapsed ? rows.slice(0, 20) : rows;

  function isoOrEmpty(d: Date | null): string {
    if (!d) return '';
    return d.toISOString().slice(0, 10);
  }

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 mb-3">
        <NumberField
          label="Recency exclusion (days)"
          value={opts.recencyExclusionDays}
          onChange={(n) => onOptsChange({ ...opts, recencyExclusionDays: n })}
        />
        <DateField
          label="Clean Deal ≥"
          value={isoOrEmpty(opts.startDate)}
          onChange={(s) => onOptsChange({ ...opts, startDate: s ? new Date(s) : null })}
        />
        <DateField
          label="Clean Deal ≤"
          value={isoOrEmpty(opts.endDate)}
          onChange={(s) => onOptsChange({ ...opts, endDate: s ? new Date(s) : null })}
        />
        <button
          type="button"
          onClick={() => onOptsChange({ recencyExclusionDays: 0, startDate: null, endDate: null })}
          className="text-xs px-2.5 py-1.5 rounded-md text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-muted)]"
        >
          Reset
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="text-sm text-[var(--muted)]">No deals match these timeline filters.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[60rem]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-[0.14em] text-[var(--muted)] border-b border-[var(--border)]">
                <th className="py-2 pr-3 font-semibold">{groupLabel}</th>
                <th className="py-2 pr-3 font-semibold text-right">Count</th>
                {STAGES.map((s) => (
                  <th key={s.label} className="py-2 pr-3 font-semibold text-right" title={s.label}>
                    {SHORT[s.label as StageKey]}
                  </th>
                ))}
                <th className="py-2 font-semibold text-right">Completion</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.key} className="border-b border-[var(--border)] last:border-0">
                  <td className="py-2 pr-3 text-[var(--ink)]">{r.key}</td>
                  <td className="py-2 pr-3 text-right num tabular-nums">{r.count}</td>
                  {STAGES.map((s) => {
                    const stat: IqrStats = r.stages[s.label as StageKey];
                    return (
                      <td
                        key={s.label}
                        className="py-2 pr-3 text-right num tabular-nums text-[var(--ink)]"
                        title={`Median ${fmtDays(stat.median)} · Q1 ${fmtDays(stat.q1)} · Q3 ${fmtDays(stat.q3)} · n=${stat.count}`}
                      >
                        {fmtDays(stat.median)}
                      </td>
                    );
                  })}
                  <td className="py-2 text-right num tabular-nums text-[var(--muted)]">{fmtPct(r.completionPct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows.length > 20 && (
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="mt-3 text-xs px-2.5 py-1 rounded-md text-[var(--brand-cyan)] hover:bg-[var(--brand-cyan-soft)]/40"
        >
          {collapsed ? `Show all ${rows.length}` : 'Show fewer'}
        </button>
      )}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div>
      <label className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)] mb-1">{label}</label>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="w-28 px-2 py-1.5 text-sm rounded-md border border-[var(--border-strong)] bg-[var(--surface)] focus:border-[var(--brand-cyan)] focus:outline-none"
      />
    </div>
  );
}

function DateField({
  label,
  value,
  onChange,
}: { label: string; value: string; onChange: (s: string) => void }) {
  return (
    <div>
      <label className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)] mb-1">{label}</label>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-2 py-1.5 text-sm rounded-md border border-[var(--border-strong)] bg-[var(--surface)] focus:border-[var(--brand-cyan)] focus:outline-none"
      />
    </div>
  );
}
