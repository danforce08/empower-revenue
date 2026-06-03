'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowser } from '@/lib/supabase/client';

type UploadResult = {
  rowCount: number;
  weeksCovered: number;
  channelsAffected: number;
  dateRange: string | null;
  branchesSeen: string[];
  warnings: string[];
};

export default function UploadPage() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<'idle' | 'uploading' | 'parsing'>('idle');

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setError(null);
    setResult(null);

    start(async () => {
      setStage('uploading');
      setProgress(0);
      // Step 1: upload the file directly to a PRIVATE Supabase Storage bucket
      // from the browser, authorized by a one-time signed upload token the
      // server issues (service-role). The browser holds no Storage write
      // grant, so the bucket has zero anon access. Direct-to-Storage still
      // bypasses Vercel's 4.5MB function body limit.
      const supabase = getSupabaseBrowser();
      // Random prefix per upload so concurrent uploaders don't clobber and so
      // the file path itself acts as an unguessable token.
      const prefix = crypto.randomUUID();
      const path = `${prefix}/${file.name}`;
      console.log('[upload] starting supabase upload', { path, size: file.size });

      // Browser progress isn't exposed by supabase-js .upload(), so we fake a
      // smooth ramp via a timer that stops when the await resolves. Good enough
      // to show the UI is alive.
      let progressTimer: ReturnType<typeof setInterval> | undefined;
      progressTimer = setInterval(() => {
        setProgress((p) => (p < 90 ? p + 2 : p));
      }, 400);

      try {
        // Get a one-time signed upload token from the server (service-role).
        const signRes = await fetch('/upload/sign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path }),
        });
        const signJson = await signRes.json();
        if (!signRes.ok) {
          throw new Error(signJson.error ?? 'Could not authorize upload');
        }
        const { error: upErr } = await supabase.storage
          .from('jobflo-uploads')
          .uploadToSignedUrl(signJson.path ?? path, signJson.token, file, {
            upsert: true,
            contentType:
              file.name.endsWith('.csv')
                ? 'text/csv'
                : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          });
        if (upErr) throw upErr;
        setProgress(100);
      } catch (err) {
        if (progressTimer) clearInterval(progressTimer);
        console.error('[upload] supabase upload failed:', err);
        const detail = err instanceof Error ? err.message : String(err);
        setError(`Upload failed — ${detail}`);
        setStage('idle');
        return;
      } finally {
        if (progressTimer) clearInterval(progressTimer);
      }

      // Step 2: server fetches the uploaded file from the bucket and parses it.
      setStage('parsing');
      try {
        const res = await fetch('/upload/api', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ supabasePath: path, fileName: file.name }),
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error ?? 'Parse failed');
        } else {
          setResult(json);
          router.refresh();
        }
      } catch (err) {
        console.error('Parse request failed:', err);
        setError(err instanceof Error ? err.message : 'Parse request failed');
      } finally {
        setStage('idle');
      }
    });
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 anim-fade-rise">
      <p className="text-xs uppercase tracking-[0.18em] text-[var(--brand-cyan)] font-medium mb-2">
        Data ingest
      </p>
      <h1 className="text-3xl font-semibold tracking-tight text-[var(--ink)]">
        Jobflo upload
      </h1>
      <p className="text-sm text-[var(--muted)] mt-2">
        Drop a Jobflo customer-export CSV or XLSX. The file replaces any prior Jobflo upload
        for the weeks it covers — manual-entry rows are preserved untouched.
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-5">
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
          }}
          className={`block border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all duration-200 ${
            dragOver
              ? 'border-[var(--brand-cyan)] bg-[var(--brand-cyan-soft)]/30 scale-[1.01]'
              : 'border-[var(--border-strong)] bg-[var(--surface)] hover:border-[var(--brand-cyan)] hover:bg-[var(--surface-muted)]'
          }`}
        >
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-[var(--brand-cyan-soft)] flex items-center justify-center">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--ink)]">
                <path d="M12 5v14M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            {file ? (
              <>
                <div className="text-sm font-medium text-[var(--ink)]">{file.name}</div>
                <div className="text-xs text-[var(--muted)] num">
                  {file.size >= 1024 * 1024
                    ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
                    : `${(file.size / 1024).toFixed(1)} KB`}
                </div>
              </>
            ) : (
              <>
                <div className="text-sm font-medium text-[var(--foreground)]">
                  Drag a file here, or click to choose
                </div>
                <div className="text-xs text-[var(--muted)]">.csv, .xlsx, .xls</div>
              </>
            )}
          </div>
        </label>

        {error && (
          <div className="text-sm rounded-lg border border-rose-200 bg-rose-50 text-rose-800 px-4 py-3 anim-fade-in">
            {error}
          </div>
        )}

        {result && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-5 py-4 space-y-2 anim-fade-rise">
            <div className="flex items-center gap-2">
              <span className="text-emerald-600">●</span>
              <strong className="text-sm text-emerald-900">Saved.</strong>
            </div>
            <div className="text-sm text-emerald-800 num">
              {result.rowCount} rows · {result.weeksCovered} weeks · {result.channelsAffected} channels
            </div>
            {result.dateRange && (
              <div className="text-xs text-emerald-700 num">Date range: {result.dateRange}</div>
            )}
            {result.branchesSeen.length > 0 && (
              <div className="text-xs text-emerald-700">
                Branches detected: {result.branchesSeen.join(', ')}
              </div>
            )}
            {result.warnings.length > 0 && (
              <ul className="list-disc list-inside text-xs text-amber-800">
                {result.warnings.map((w) => <li key={w}>{w}</li>)}
              </ul>
            )}
          </div>
        )}

        {stage !== 'idle' && (
          <div className="space-y-1.5 anim-fade-in">
            <div className="flex items-center justify-between text-xs text-[var(--muted)]">
              <span>
                {stage === 'uploading' ? `Uploading to Vercel Blob — ${progress.toFixed(0)}%` : 'Parsing on the server…'}
              </span>
              {stage === 'uploading' && (
                <span className="num">{progress.toFixed(0)}%</span>
              )}
            </div>
            <div className="h-1.5 rounded-full bg-[var(--surface-muted)] overflow-hidden">
              <div
                className="h-full bg-[var(--brand-cyan)] transition-[width] duration-150"
                style={{ width: stage === 'uploading' ? `${progress}%` : '100%' }}
              />
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={pending || !file}
            className="btn-primary text-sm font-medium px-5 py-2.5 rounded-lg disabled:opacity-50"
          >
            {pending
              ? stage === 'parsing'
                ? 'Parsing…'
                : `Uploading… ${progress.toFixed(0)}%`
              : 'Upload'}
          </button>
        </div>
      </form>
    </div>
  );
}
