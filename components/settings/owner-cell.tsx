'use client';

import { useState, useTransition } from 'react';
import { updateChannelOwner } from '@/app/settings/actions';

/**
 * Inline editor for a single channel's KPI owner. Renders a text input; a
 * Save button appears only when the value differs from what's stored. Saving
 * calls the `updateChannelOwner` server action (server-side write, gated by
 * the shared-password session). Clearing the field unsets the owner.
 */
export function OwnerCell({
  channelId,
  initialOwner,
}: {
  channelId: string;
  initialOwner: string | null;
}) {
  const [value, setValue] = useState(initialOwner ?? '');
  const [baseline, setBaseline] = useState(initialOwner ?? '');
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const dirty = value.trim() !== baseline.trim();

  function save() {
    setStatus('idle');
    setErrorMsg(null);
    start(async () => {
      const res = await updateChannelOwner(channelId, value);
      if (res.ok) {
        setBaseline(value);
        setStatus('saved');
      } else {
        setStatus('error');
        setErrorMsg(res.error);
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          if (status !== 'idle') setStatus('idle');
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && dirty && !pending) save();
        }}
        placeholder="Unassigned"
        aria-label="KPI owner"
        className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm text-[var(--ink)] placeholder:text-[var(--muted)] transition-colors focus:outline-none focus:border-[var(--brand-cyan)] focus:ring-2 focus:ring-[var(--brand-cyan)]"
      />
      {dirty ? (
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="shrink-0 rounded-md bg-[var(--brand-cyan)] px-2.5 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
      ) : status === 'saved' ? (
        <span className="shrink-0 text-xs font-medium text-emerald-600 anim-fade-in" aria-live="polite">
          ✓ Saved
        </span>
      ) : null}
      {status === 'error' && (
        <span className="shrink-0 text-xs text-red-600" title={errorMsg ?? undefined}>
          Failed
        </span>
      )}
    </div>
  );
}
