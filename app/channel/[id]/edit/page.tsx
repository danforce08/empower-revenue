import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase/server';
import { MetricForm } from '@/components/metric-form';
import type { BranchLookup, Channel, SourceLookup } from '@/lib/types';
import { KindLabel } from '@/components/kind-label';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ id: string }> };

export default async function ChannelEditPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await getSupabaseServer();

  const [channelRes, sourcesRes, branchesRes] = await Promise.all([
    supabase.from('channels').select('*').eq('id', id).maybeSingle(),
    supabase.from('sources').select('*').eq('status', 'active').order('sort_order'),
    supabase.from('branches').select('*').eq('status', 'active').order('sort_order'),
  ]);

  const channel = channelRes.data as Channel | null;
  if (!channel) notFound();

  const sources = (sourcesRes.data ?? []) as SourceLookup[];
  const branches = (branchesRes.data ?? []) as BranchLookup[];

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 anim-fade-rise">
      <Link
        href={`/channel/${channel.id}`}
        className="text-xs text-[var(--muted)] hover:text-[var(--brand-cyan)] transition-colors"
      >
        ← Back to {channel.name}
      </Link>
      <div className="flex items-center gap-3 mt-1">
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--ink)]">
          Enter numbers
        </h1>
        <KindLabel kind={channel.kind} />
      </div>
      <p className="text-sm text-[var(--muted)] mt-1.5">
        Submitting creates or replaces the manual-entry row for {channel.name} this week.
      </p>

      <div className="mt-8 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-7 shadow-[0_1px_2px_rgba(10,24,40,0.04),0_8px_24px_-12px_rgba(10,24,40,0.08)]">
        <MetricForm
          channel={channel}
          sources={sources}
          branches={branches}
        />
      </div>
    </div>
  );
}
