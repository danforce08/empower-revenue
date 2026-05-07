'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { BranchLookup, Channel, SourceLookup } from '@/lib/types';
import { submitMetric } from './metric-form.actions';
import { renderCell } from '@/lib/cell-format';
import { KindLabel } from './kind-label';

type Saved = 'idle' | 'saving' | 'ok' | 'error';

export function QuickEntryRow({
  channel,
  periodStart,
  currentRollup,
  hasManualEntry,
  sources,
  branches,
}: {
  channel: Channel;
  periodStart: string;
  currentRollup: Record<string, number | string[]>;
  hasManualEntry: boolean;
  sources: SourceLookup[];
  branches: BranchLookup[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<Saved>('idle');
  const [error, setError] = useState<string | null>(null);
  // Synchronous in-flight + recent-submit guard. useTransition's `pending`
  // is one tick behind the click, so a fast double-click can sneak through.
  // Block submits within 1 s of the prior one to keep insert-only mode from
  // creating duplicate rows.
  const lockRef = useRef<{ inFlight: boolean; lastAt: number }>({ inFlight: false, lastAt: 0 });

  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(channel.metrics_schema.map((f) => [f.key, ''])),
  );
  const [source, setSource] = useState('');
  const [branch, setBranch] = useState('');

  const showSourceField = channel.supports_source_breakdown;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Synchronous guard against double-submits — useTransition's `pending`
    // bool is one tick behind the click, so a fast second click can fire
    // before the button disables.
    const now = Date.now();
    if (lockRef.current.inFlight) return;
    if (now - lockRef.current.lastAt < 1000) return;
    lockRef.current.inFlight = true;
    lockRef.current.lastAt = now;
    setError(null);
    setStatus('saving');

    const metrics: Record<string, number> = {};
    for (const f of channel.metrics_schema) {
      const v = values[f.key]?.trim();
      if (!v) continue;
      const n = Number(v);
      if (!Number.isFinite(n)) {
        setError(`Invalid number for ${f.label}`);
        setStatus('error');
        lockRef.current.inFlight = false;
        return;
      }
      metrics[f.key] = n;
    }
    if (Object.keys(metrics).length === 0) {
      setError('Enter at least one metric');
      setStatus('error');
      lockRef.current.inFlight = false;
      return;
    }

    start(async () => {
      try {
        const res = await submitMetric({
          channelId: channel.id,
          periodStart,
          source: source || null,
          branch: branch || null,
          product: null,
          metrics,
          notes: null,
          excludedFromKpi: false,
        });
        if (res.error) {
          setError(res.error);
          setStatus('error');
        } else {
          setStatus('ok');
          setValues(Object.fromEntries(channel.metrics_schema.map((f) => [f.key, ''])));
          router.refresh();
          // Reset success indicator after a moment
          setTimeout(() => setStatus('idle'), 2000);
        }
      } finally {
        lockRef.current.inFlight = false;
      }
    });
  }

  const currentText = renderCell(channel.cell_format, currentRollup, channel.metrics_schema);

  // Channels whose canonical source is the Jobflo upload — manual entries
  // here exist in the DB but are filtered out of the homepage / dashboard
  // rollups. Surface that fact so users don't expect their numbers to show.
  const JOBFLO_SOURCE_CHANNELS = new Set([
    'total_sales', 'roof', 'battery_only', 'internal', 'dealer',
  ]);
  const isJobfloSourced = JOBFLO_SOURCE_CHANNELS.has(channel.key);

  return (
    <form
      onSubmit={onSubmit}
      className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 hover:border-[var(--brand-cyan)] transition-colors"
    >
      {/* Header row: channel name + current state */}
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <div className="flex items-baseline gap-3 flex-wrap">
          <span className="text-base font-semibold text-[var(--ink)]">{channel.name}</span>
          <KindLabel kind={channel.kind} />
          <span className="text-xs text-[var(--muted)]">{channel.owner_label ?? ''}</span>
          <span className="chip bg-[var(--surface-muted)] text-[var(--muted)] num">
            target {channel.quantum_weekly}/wk
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {hasManualEntry ? (
            <span className="text-[var(--muted)] num">
              Saved: <span className="text-[var(--ink)] font-medium">{currentText}</span>
            </span>
          ) : (
            <span className="text-[var(--muted)]">No manual entry yet</span>
          )}
        </div>
      </div>

      {isJobfloSourced && (
        <div className="mb-3 text-[11px] rounded-md bg-amber-50 border border-amber-200 text-amber-900 px-3 py-2">
          ⚠ {channel.name} rollups read from the Jobflo upload, not manual entries.
          Your input here will be saved but won't appear on the homepage / Dashboard
          totals. To correct this channel's numbers, re-upload the Jobflo file.
        </div>
      )}

      {/* Inputs grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {channel.metrics_schema.map((f) => (
          <label key={f.key} className="block">
            <span className="block text-[10px] uppercase tracking-[0.1em] text-[var(--muted)] mb-1 truncate">
              {f.label}
            </span>
            <input
              type="number"
              step="any"
              value={values[f.key]}
              onChange={(e) => setValues((s) => ({ ...s, [f.key]: e.target.value }))}
              placeholder={f.type === 'currency' ? '$0' : '0'}
              className="w-full px-2.5 py-1.5 border border-[var(--border-strong)] rounded-md text-sm font-mono focus:border-[var(--brand-cyan)] focus:outline-none transition-colors"
            />
          </label>
        ))}
      </div>

      {/* Optional source/branch row + save */}
      <div className="flex items-end justify-between gap-3 mt-3 flex-wrap">
        <div className="flex gap-2">
          {showSourceField && (
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="text-xs px-2 py-1.5 border border-[var(--border-strong)] rounded-md bg-[var(--surface)]"
            >
              <option value="">— any source —</option>
              {sources.map((s) => (
                <option key={s.key} value={s.key}>{s.name}</option>
              ))}
            </select>
          )}
          <select
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            className="text-xs px-2 py-1.5 border border-[var(--border-strong)] rounded-md bg-[var(--surface)]"
          >
            <option value="">— any branch —</option>
            {branches.map((b) => (
              <option key={b.key} value={b.key}>{b.name}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3">
          {status === 'ok' && (
            <span className="chip bg-emerald-50 text-emerald-700 anim-fade-in">Saved ✓</span>
          )}
          {status === 'error' && error && (
            <span className="chip bg-rose-50 text-rose-700">{error}</span>
          )}
          <button
            type="submit"
            disabled={pending}
            className="btn-primary text-xs font-medium px-4 py-1.5 rounded-md disabled:opacity-50"
          >
            {pending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </form>
  );
}
