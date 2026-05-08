'use client';

import { useState, useTransition } from 'react';
import { editReportBody } from '@/app/sales-context/[week]/actions';

/**
 * Inline markdown-body editor for a sales-context report. Sits next to
 * the publish/draft toggle. Save → server action → Vercel Blob.
 *
 * Frontmatter (week, date_range, pipeline, published, …) is preserved
 * server-side. The textarea exposes only the body — including the
 * `## Pipeline` section — so users can edit prose and the pipeline
 * markdown together without breaking the YAML.
 */
export function ReportEditor({
  slug,
  initialBody,
}: {
  slug: string;
  initialBody: string;
}) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(initialBody);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // Track whether the user has unsaved changes so the cancel button can
  // ask for confirmation before throwing them away.
  const dirty = body !== initialBody;

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="rounded-lg px-4 py-2 text-sm font-semibold border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--ink)] hover:bg-[var(--surface)] transition shadow-sm"
      >
        Edit body
      </button>
    );
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    start(async () => {
      try {
        await editReportBody(formData);
        // Initial body is now the saved body; close the editor.
        setEditing(false);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Save failed';
        setError(msg);
      }
    });
  }

  function onCancel() {
    if (dirty && !confirm('Discard your changes?')) return;
    setBody(initialBody);
    setEditing(false);
    setError(null);
  }

  return (
    <form onSubmit={onSubmit} className="w-full">
      <input type="hidden" name="slug" value={slug} />
      <textarea
        name="body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={28}
        spellCheck
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm font-mono leading-relaxed text-[var(--ink)] focus:border-[var(--brand-cyan)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-cyan-soft)]"
        disabled={pending}
        autoFocus
      />
      {error && (
        <div className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          {error}
        </div>
      )}
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <button
          type="submit"
          disabled={pending || !dirty}
          className="rounded-lg px-4 py-2 text-sm font-semibold bg-brand-gradient text-white shadow-sm transition hover:opacity-95 disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="rounded-lg px-4 py-2 text-sm font-semibold border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--ink)] hover:bg-[var(--surface)] transition disabled:opacity-50"
        >
          Cancel
        </button>
        <span className="ml-auto text-xs text-[var(--muted)]">
          {dirty ? 'Unsaved changes' : 'No changes'}
        </span>
      </div>
    </form>
  );
}
