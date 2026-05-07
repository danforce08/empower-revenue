'use client';

import { useState } from 'react';

export function FileDrop({
  onFile,
  pending,
  error,
}: {
  onFile: (file: File) => void;
  pending: boolean;
  error: string | null;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [name, setName] = useState<string | null>(null);

  function handle(file: File | null | undefined) {
    if (!file) return;
    setName(file.name);
    onFile(file);
  }

  return (
    <div className="anim-fade-rise">
      <label
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handle(e.dataTransfer.files[0]);
        }}
        className={`block border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-200 ${
          dragOver
            ? 'border-[var(--brand-cyan)] bg-[var(--brand-cyan-soft)]/30 scale-[1.005]'
            : 'border-[var(--border-strong)] bg-[var(--surface)] hover:border-[var(--brand-cyan)] hover:bg-[var(--surface-muted)]'
        }`}
      >
        <input
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => handle(e.target.files?.[0])}
        />
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-[var(--brand-cyan-soft)] flex items-center justify-center">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--ink)]">
              <path d="M12 5v14M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          {name ? (
            <>
              <div className="text-sm font-medium text-[var(--ink)]">{name}</div>
              <div className="text-xs text-[var(--muted)]">
                {pending ? 'Parsing…' : 'Drop a different file to replace.'}
              </div>
            </>
          ) : (
            <>
              <div className="text-sm font-medium text-[var(--foreground)]">
                Drop a Jobflo customer export
              </div>
              <div className="text-xs text-[var(--muted)]">
                customers_YYYY-MM-DD_*.xlsx — parsed in your browser. No file leaves this tab.
              </div>
            </>
          )}
        </div>
      </label>
      {error && (
        <div className="mt-3 text-sm rounded-lg border border-rose-200 bg-rose-50 text-rose-800 px-4 py-3 anim-fade-in">
          {error}
        </div>
      )}
    </div>
  );
}
