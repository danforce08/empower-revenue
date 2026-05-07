import Link from 'next/link';
import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { listReports, getReport } from '@/lib/sales-context/reports';
import { Sidebar } from '@/lib/sales-context/Sidebar';
import { PipelineBlock } from '@/lib/sales-context/PipelineBlock';

export const dynamic = 'force-dynamic';

export default async function WeekPage({
  params,
}: {
  params: Promise<{ week: string }>;
}) {
  const { week } = await params;
  const [report, all] = await Promise.all([getReport(week), listReports()]);
  if (!report) notFound();

  const generatedAt = report.generated_at
    ? new Date(report.generated_at).toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;

  const idx = all.findIndex((r) => r.slug === week);
  const isLatest = idx === 0;
  const prev = idx >= 0 && idx + 1 < all.length ? all[idx + 1] : null;
  const next = idx > 0 ? all[idx - 1] : null;

  return (
    <div className="lg:flex">
      <Sidebar reports={all} current={week} />

      <main className="flex-1 min-w-0">
        <div className="mx-auto max-w-3xl px-6 py-10 lg:py-14">
          <header className="mb-8 anim-fade-rise">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2.5 flex-wrap text-xs">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-gradient px-3 py-1 font-semibold tabular-nums tracking-wide text-white shadow-sm">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--brand-cyan)]" />
                  {report.week}
                </span>
                <span className="text-[var(--muted)] font-medium">
                  {report.date_range ?? ''}
                </span>
                {isLatest && (
                  <span className="inline-flex items-center rounded-full border border-[var(--brand-cyan)] bg-[var(--brand-cyan-soft)] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink)]">
                    Latest
                  </span>
                )}
              </div>
            </div>
            {generatedAt && (
              <div className="mt-2 text-xs text-[var(--muted)]">
                Generated {generatedAt}
              </div>
            )}
          </header>

          {report.pipeline && <PipelineBlock data={report.pipeline} />}

          <article className="prose-report anim-fade-rise">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {report.content}
            </ReactMarkdown>
          </article>

          {(prev || next) && (
            <nav aria-label="Adjacent weeks" className="mt-16 grid grid-cols-2 gap-3">
              {prev ? (
                <Link
                  href={`/sales-context/${prev.slug}`}
                  className="group rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 transition hover:border-[var(--brand-cyan)] hover:bg-[var(--surface-muted)]"
                >
                  <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--muted)] font-semibold">
                    Previous week
                  </div>
                  <div className="mt-1.5 text-sm font-semibold text-[var(--ink)] tabular-nums">
                    {prev.week}
                  </div>
                  <div className="text-xs text-[var(--muted)]">
                    {prev.date_range ?? prev.slug}
                  </div>
                </Link>
              ) : (
                <div />
              )}
              {next ? (
                <Link
                  href={`/sales-context/${next.slug}`}
                  className="group rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-right transition hover:border-[var(--brand-cyan)] hover:bg-[var(--surface-muted)]"
                >
                  <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--muted)] font-semibold">
                    Next week
                  </div>
                  <div className="mt-1.5 text-sm font-semibold text-[var(--ink)] tabular-nums">
                    {next.week}
                  </div>
                  <div className="text-xs text-[var(--muted)]">
                    {next.date_range ?? next.slug}
                  </div>
                </Link>
              ) : (
                <div />
              )}
            </nav>
          )}

          <footer className="mt-16 pt-6 border-t border-[var(--border)] text-xs text-[var(--muted)] flex items-center justify-between">
            <span>Empower Home Services · Internal · Audience: ops team</span>
            {report.word_count && (
              <span className="tabular-nums">{report.word_count} words</span>
            )}
          </footer>
        </div>
      </main>
    </div>
  );
}
