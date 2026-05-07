'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { mostRecentSunday, weekStart, isoDate } from '@/lib/periods';
import type { BranchLookup, Channel, SourceLookup } from '@/lib/types';
import { submitMetric } from './metric-form.actions';
import { WeekSelect } from './week-select';

const productOptions = ['solar', 'battery', 'hvac', 'roof', 'maintenance'] as const;

const inputBase =
  'w-full px-3 py-2.5 border border-[var(--border-strong)] rounded-lg text-sm bg-[var(--surface)] focus:border-[var(--brand-cyan)] focus:outline-none transition-colors';

export function MetricForm({
  channel,
  sources,
  branches,
}: {
  channel: Channel;
  sources: SourceLookup[];
  branches: BranchLookup[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const today = new Date();
  const defaultSunday = mostRecentSunday(today);
  const defaultWeekStart = isoDate(weekStart(defaultSunday));

  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(channel.metrics_schema.map((f) => [f.key, ''])),
  );
  const [periodStart, setPeriodStart] = useState(defaultWeekStart);
  const [source, setSource] = useState('');
  const [branch, setBranch] = useState('');
  const [product, setProduct] = useState('');
  const [notes, setNotes] = useState('');
  const [excluded, setExcluded] = useState(false);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const metrics: Record<string, number> = {};
    for (const f of channel.metrics_schema) {
      const v = values[f.key]?.trim();
      if (!v) continue;
      const n = Number(v);
      if (!Number.isFinite(n)) {
        setError(`Invalid number for ${f.label}: "${v}"`);
        return;
      }
      metrics[f.key] = n;
    }
    if (Object.keys(metrics).length === 0) {
      setError('Enter at least one metric.');
      return;
    }

    start(async () => {
      const res = await submitMetric({
        channelId: channel.id,
        periodStart,
        source: source || null,
        branch: branch || null,
        product: product || null,
        metrics,
        notes: notes || null,
        excludedFromKpi: excluded,
      });
      if (res.error) setError(res.error);
      else {
        setSuccess('Saved.');
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <Field label="Week">
        <WeekSelect value={periodStart} onChange={setPeriodStart} />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {channel.metrics_schema.map((f) => (
          <Field key={f.key} label={f.label}>
            <input
              type="number"
              step="any"
              value={values[f.key]}
              onChange={(e) => setValues((s) => ({ ...s, [f.key]: e.target.value }))}
              placeholder={f.type === 'currency' ? '0.00' : '0'}
              className={inputBase + ' num'}
            />
          </Field>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {channel.supports_source_breakdown && (
          <Field label="Source">
            <select value={source} onChange={(e) => setSource(e.target.value)} className={inputBase}>
              <option value="">— any —</option>
              {sources.map((s) => (
                <option key={s.key} value={s.key}>{s.name}</option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Branch (optional)">
          <select value={branch} onChange={(e) => setBranch(e.target.value)} className={inputBase}>
            <option value="">— any —</option>
            {branches.map((b) => (
              <option key={b.key} value={b.key}>{b.name} ({b.state})</option>
            ))}
          </select>
        </Field>
        <Field label="Product (optional)">
          <select value={product} onChange={(e) => setProduct(e.target.value)} className={inputBase}>
            <option value="">— any —</option>
            {productOptions.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Notes (optional)">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className={inputBase}
        />
      </Field>

      <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
        <input
          type="checkbox"
          checked={excluded}
          onChange={(e) => setExcluded(e.target.checked)}
          className="accent-[var(--brand-cyan)]"
        />
        Exclude from KPI rollups
      </label>

      {error && (
        <div className="text-sm rounded-lg border border-rose-200 bg-rose-50 text-rose-800 px-4 py-3 anim-fade-in">
          {error}
        </div>
      )}
      {success && (
        <div className="text-sm rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 px-4 py-3 anim-fade-in">
          {success}
        </div>
      )}

      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={pending}
          className="btn-primary text-sm font-medium px-5 py-2.5 rounded-lg disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium uppercase tracking-wide text-[var(--muted)] mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}
