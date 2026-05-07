'use client';

import { useEffect, useRef, useState } from 'react';

export function MultiSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const selected = new Set(value);
  const triggerLabel =
    value.length === 0 ? 'All' : value.length === 1 ? value[0] : `${value.length} selected`;

  const filtered = query
    ? options.filter((o) => o.toLowerCase().includes(query.toLowerCase()))
    : options;

  function toggle(opt: string) {
    if (selected.has(opt)) onChange(value.filter((v) => v !== opt));
    else onChange([...value, opt]);
  }

  return (
    <div className="relative" ref={wrapRef}>
      <label className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)] mb-1">
        {label}
      </label>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full min-w-[10rem] flex items-center justify-between gap-2 px-3 py-2 text-sm rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] hover:border-[var(--brand-cyan)] focus:border-[var(--brand-cyan)] focus:outline-none transition-colors"
      >
        <span className={value.length === 0 ? 'text-[var(--muted)]' : 'text-[var(--ink)]'}>
          {triggerLabel}
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--muted)]">
          <polyline points="6 9 12 15 18 9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-30 mt-1.5 w-full min-w-[14rem] max-h-72 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-[0_12px_32px_-8px_rgba(10,24,40,0.25)] anim-fade-in">
          <div className="p-2 border-b border-[var(--border)]">
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter…"
              className="w-full px-2 py-1.5 text-xs rounded-md border border-[var(--border)] bg-[var(--surface-muted)] focus:outline-none focus:border-[var(--brand-cyan)]"
            />
          </div>
          <ul className="max-h-48 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-xs text-[var(--muted)]">No matches.</li>
            )}
            {filtered.map((opt) => {
              const checked = selected.has(opt);
              return (
                <li key={opt}>
                  <button
                    type="button"
                    onClick={() => toggle(opt)}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-[var(--surface-muted)] ${checked ? 'text-[var(--ink)]' : 'text-[var(--foreground)]'}`}
                  >
                    <span
                      className={`flex-shrink-0 w-4 h-4 rounded border ${checked ? 'bg-[var(--brand-cyan)] border-[var(--brand-cyan)]' : 'border-[var(--border-strong)]'} flex items-center justify-center`}
                    >
                      {checked && (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                          <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                    <span className="truncate">{opt}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="flex items-center justify-between gap-2 px-2 py-1.5 border-t border-[var(--border)] bg-[var(--surface-muted)]">
            <button
              type="button"
              onClick={() => onChange(filtered.slice())}
              className="text-[11px] px-2 py-1 rounded text-[var(--muted)] hover:text-[var(--ink)]"
            >
              Select all
            </button>
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-[11px] px-2 py-1 rounded text-[var(--muted)] hover:text-[var(--ink)]"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
