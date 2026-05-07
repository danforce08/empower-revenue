import { redirect } from 'next/navigation';
import Link from 'next/link';
import { listReports } from '@/lib/sales-context/reports';

export const dynamic = 'force-dynamic';

export default async function SalesContextIndex() {
  const reports = await listReports();
  if (reports.length > 0) {
    redirect(`/sales-context/${reports[0].slug}`);
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-16 anim-fade-rise">
      <p className="text-xs uppercase tracking-[0.18em] text-[var(--brand-cyan)] font-medium mb-2">
        Sales context
      </p>
      <h1 className="text-3xl font-semibold tracking-tight text-[var(--ink)]">
        No reports yet
      </h1>
      <p className="text-sm text-[var(--muted)] mt-3">
        Friday weekly reports land in <code className="text-xs">content/reports/*.md</code>.
        The brain&apos;s <code className="text-xs">auto-friday-sales-context</code> skill
        writes them every Friday morning.
      </p>
      <Link
        href="/"
        className="mt-6 inline-block text-sm text-[var(--brand-cyan)] hover:underline"
      >
        ← Back to dashboard
      </Link>
    </div>
  );
}
