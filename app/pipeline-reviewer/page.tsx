'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { parsePipelineXlsx } from '@/lib/pipeline-reviewer/parse';
import { applyFilters } from '@/lib/pipeline-reviewer/filter';
import {
  ageBuckets, branchSplit, byAhj, byBranch, cycleTime, funnel,
  kpis, projectStatusCounts, stuckDeals, type TimelineOpts,
} from '@/lib/pipeline-reviewer/compute';
import { EMPTY_FILTERS, type Filters, type ParseResult } from '@/lib/pipeline-reviewer/types';

import { FilterBar } from '@/components/pipeline-reviewer/filter-bar';
import { SectionCard } from '@/components/pipeline-reviewer/section-card';
import { KpiGrid } from '@/components/pipeline-reviewer/kpi-grid';
import { FunnelChart } from '@/components/pipeline-reviewer/funnel-chart';
import { BranchSplitTable } from '@/components/pipeline-reviewer/branch-split';
import { AgeBuckets } from '@/components/pipeline-reviewer/age-buckets';
import { CycleTimeTable } from '@/components/pipeline-reviewer/cycle-time-table';
import { StatusDistribution } from '@/components/pipeline-reviewer/status-distribution';
import { TimelineTable } from '@/components/pipeline-reviewer/timeline-table';
import { StuckDealsTable } from '@/components/pipeline-reviewer/stuck-deals-table';

const NO_TIMELINE_OPTS: TimelineOpts = { recencyExclusionDays: 0, startDate: null, endDate: null };

type LoadState =
  | { tag: 'loading' }
  | { tag: 'no-upload' }
  | { tag: 'error'; message: string }
  | { tag: 'ready'; parsed: ParseResult };

export default function PipelineReviewerPage() {
  const [load, setLoad] = useState<LoadState>({ tag: 'loading' });
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [ahjOpts, setAhjOpts] = useState<TimelineOpts>(NO_TIMELINE_OPTS);
  const [branchOpts, setBranchOpts] = useState<TimelineOpts>(NO_TIMELINE_OPTS);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/pipeline-reviewer/file', { cache: 'no-store' });
        if (res.status === 404) {
          if (!cancelled) setLoad({ tag: 'no-upload' });
          return;
        }
        if (!res.ok) {
          throw new Error(`Could not fetch the latest upload (HTTP ${res.status}).`);
        }
        const fileNameRaw = res.headers.get('x-original-filename') ?? 'upload.xlsx';
        const fileName = decodeURIComponent(fileNameRaw);
        const uploadedAt = res.headers.get('x-uploaded-at');
        const fallbackMs = uploadedAt ? Date.parse(uploadedAt) || Date.now() : Date.now();
        const buf = await res.arrayBuffer();
        const result = await parsePipelineXlsx(buf, fileName, fallbackMs);
        if (!cancelled) setLoad({ tag: 'ready', parsed: result });
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Could not load the latest upload.';
        console.error('[pipeline-reviewer] load failed:', err);
        setLoad({ tag: 'error', message });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const parsed = load.tag === 'ready' ? load.parsed : null;

  const filtered = useMemo(
    () => (parsed ? applyFilters(parsed.deals, filters) : []),
    [parsed, filters],
  );
  const k        = useMemo(() => kpis(filtered), [filtered]);
  const fnl      = useMemo(() => funnel(filtered), [filtered]);
  const ageRows  = useMemo(() => ageBuckets(filtered), [filtered]);
  const cycle    = useMemo(() => cycleTime(filtered), [filtered]);
  const status   = useMemo(() => projectStatusCounts(filtered), [filtered]);
  const stuck    = useMemo(() => stuckDeals(filtered), [filtered]);
  const allBranches = useMemo(() => (parsed ? branchSplit(parsed.deals) : []), [parsed]);
  const ahjRows = useMemo(
    () => (parsed ? byAhj(filtered, ahjOpts, parsed.asOf) : []),
    [parsed, filtered, ahjOpts],
  );
  const branchRows = useMemo(
    () => (parsed ? byBranch(filtered, branchOpts, parsed.asOf) : []),
    [parsed, filtered, branchOpts],
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-5">
      <div className="anim-fade-rise">
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--brand-cyan)] font-medium mb-1">
          Pipeline Reviewer
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--ink)]">
          {parsed ? `${parsed.partnerName} — Pipeline Review` : 'Pipeline Reviewer'}
        </h1>
        {parsed ? (
          <p className="text-sm text-[var(--muted)] mt-1.5">
            As of {parsed.asOf.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}{' '}
            · {parsed.deals.length.toLocaleString()} total deals · IQR-based cycle times · Reading the latest{' '}
            <Link href="/upload" className="underline hover:text-[var(--ink)]">Jobflo upload</Link>.
          </p>
        ) : (
          <p className="text-sm text-[var(--muted)] mt-1.5">
            Slice pipeline performance from your latest{' '}
            <Link href="/upload" className="underline hover:text-[var(--ink)]">Jobflo upload</Link>{' '}
            by Sales Team, Branch, Utility, and AHJ.
          </p>
        )}
      </div>

      {load.tag === 'loading' && <LoadingPanel />}
      {load.tag === 'no-upload' && <NoUploadPanel />}
      {load.tag === 'error' && <ErrorPanel message={load.message} />}

      {parsed && (
        <>
          <FilterBar
            options={{
              organizations: parsed.organizations,
              branches: parsed.branches,
              utilities: parsed.utilities,
              ahjs: parsed.ahjs,
            }}
            value={filters}
            onChange={setFilters}
            onReset={() => setFilters(EMPTY_FILTERS)}
          />

          <SectionCard title="KPIs" subtitle="Filter-aware totals.">
            <KpiGrid
              items={[
                { label: 'Total',        value: k.total },
                { label: 'Active',       value: k.active },
                { label: 'Cancelled',    value: k.cancelled, tone: 'bad' },
                { label: 'Completed',    value: k.completed, tone: 'good' },
                { label: 'Stuck (180+)', value: k.stuck, tone: 'warn' },
                { label: 'Installed',    value: k.installed, tone: 'good' },
                { label: 'PTO Received', value: k.pto, tone: 'good' },
              ]}
            />
          </SectionCard>

          <div className="grid lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2">
              <SectionCard title="Pipeline Funnel" subtitle="Stage counts and conversion %.">
                <FunnelChart rows={fnl} />
              </SectionCard>
            </div>
            <SectionCard title="Branch Split" subtitle="Always all branches (ignores filter).">
              <BranchSplitTable rows={allBranches} />
            </SectionCard>
          </div>

          <div className="grid lg:grid-cols-2 gap-5">
            <SectionCard title="Active Deal Age" subtitle="Days since deal created (active deals only).">
              <AgeBuckets rows={ageRows} />
            </SectionCard>
            <SectionCard title="Cycle Time IQR" subtitle="Median, Q1, Q3 by stage transition.">
              <CycleTimeTable rows={cycle} />
            </SectionCard>
          </div>

          <SectionCard title="Project Status Distribution" subtitle="Counts and aging per project status.">
            <StatusDistribution rows={status} />
          </SectionCard>

          <SectionCard title="AHJ Timeline" subtitle="Per-AHJ stage medians (filtered by Clean Deal date).">
            <TimelineTable
              groupLabel="AHJ"
              rows={ahjRows}
              opts={ahjOpts}
              onOptsChange={setAhjOpts}
            />
          </SectionCard>

          <SectionCard title="Branch Timeline" subtitle="Per-branch stage medians (filtered by Clean Deal date).">
            <TimelineTable
              groupLabel="Branch"
              rows={branchRows}
              opts={branchOpts}
              onOptsChange={setBranchOpts}
            />
          </SectionCard>

          <SectionCard
            title="Stuck Deals"
            subtitle="Active deals only · sorted by days since created · row colored by aging tier."
          >
            <StuckDealsTable deals={stuck} />
          </SectionCard>
        </>
      )}
    </div>
  );
}

function LoadingPanel() {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-10 text-center anim-fade-in">
      <div className="text-sm text-[var(--muted)]">Loading the latest Jobflo upload…</div>
    </div>
  );
}

function NoUploadPanel() {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface)] p-10 text-center anim-fade-rise">
      <div className="text-sm font-medium text-[var(--ink)]">No Jobflo upload yet.</div>
      <div className="text-xs text-[var(--muted)] mt-1.5">
        Drop a customer export on the{' '}
        <Link href="/upload" className="underline text-[var(--brand-cyan)] hover:text-[var(--ink)]">
          Upload page
        </Link>{' '}
        and Pipeline Reviewer will read it from there.
      </div>
    </div>
  );
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 text-rose-800 p-5 text-sm anim-fade-in">
      {message}
    </div>
  );
}
