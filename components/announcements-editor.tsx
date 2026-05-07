'use client';

import { useState, useTransition } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useRouter } from 'next/navigation';

/**
 * Inline editor for the homepage announcements block. Reads its initial body
 * from the server (passed as a prop), and POSTs edits to /api/announcements.
 * Hides itself entirely when the rendered body is empty AND we're not editing.
 */
export function AnnouncementsEditor({ initialBody }: { initialBody: string }) {
  const router = useRouter();
  const [body, setBody] = useState(initialBody);
  const [draft, setDraft] = useState(initialBody);
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const trimmed = body.replace(/^#\s+Announcements\s*\n/i, '').trim();
  const hasContent = trimmed.length > 0;

  // Hide entirely when there's no content and the editor isn't open. The
  // "Edit announcements" button on the empty homepage state opens this.
  if (!hasContent && !editing) {
    return (
      <div className="mb-10 anim-fade-rise stagger-1">
        <button
          type="button"
          onClick={() => {
            setDraft(body);
            setEditing(true);
          }}
          className="text-xs uppercase tracking-[0.14em] font-semibold text-[var(--muted)] hover:text-[var(--brand-cyan)] transition-colors"
        >
          + Add announcement
        </button>
      </div>
    );
  }

  function save() {
    setError(null);
    start(async () => {
      const res = await fetch('/api/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: draft }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? 'Save failed');
        return;
      }
      setBody(draft);
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <section className="mb-10 anim-fade-rise stagger-1">
      <div className="rounded-2xl border border-[var(--brand-cyan-soft)] bg-[var(--surface)] p-5 sm:p-6 shadow-[0_1px_2px_rgba(10,24,40,0.04),0_8px_24px_-12px_rgba(10,24,40,0.08)]">
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className="text-xs uppercase tracking-[0.14em] font-semibold text-[var(--brand-cyan)]">
            Announcements
          </span>
          {!editing ? (
            <button
              type="button"
              onClick={() => {
                setDraft(body);
                setEditing(true);
              }}
              className="text-xs font-medium text-[var(--muted)] hover:text-[var(--brand-cyan)] transition-colors"
            >
              Edit
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setDraft(body);
                  setEditing(false);
                  setError(null);
                }}
                disabled={pending}
                className="text-xs font-medium text-[var(--muted)] hover:text-[var(--ink)] disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={pending}
                className="btn-primary text-xs font-medium px-3 py-1.5 rounded-md disabled:opacity-50"
              >
                {pending ? 'Saving…' : 'Save'}
              </button>
            </div>
          )}
        </div>

        {error && (
          <div className="mb-3 text-sm rounded-lg border border-rose-200 bg-rose-50 text-rose-800 px-3 py-2">
            {error}
          </div>
        )}

        {editing ? (
          <>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={8}
              className="w-full font-mono text-sm rounded-lg border border-[var(--border-strong)] bg-[var(--background)] text-[var(--foreground)] p-3 focus:border-[var(--brand-cyan)] focus:outline-none transition-colors resize-y"
              placeholder="# Announcements&#10;&#10;- Use markdown. Bullets, **bold**, [links](https://example.com), etc.&#10;- Leave the body empty to hide this section."
            />
            <p className="text-[11px] text-[var(--muted)] mt-2">
              Markdown supported. Save commits the change for everyone immediately.
            </p>
          </>
        ) : (
          <div className="prose prose-sm max-w-none prose-p:text-[var(--foreground)] prose-li:text-[var(--foreground)] prose-headings:text-[var(--ink)] prose-strong:text-[var(--ink)] prose-a:text-[var(--brand-cyan)]">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{trimmed}</ReactMarkdown>
          </div>
        )}
      </div>
    </section>
  );
}
