import { getSupabaseServer } from '@/lib/supabase/server';
import type { Channel } from '@/lib/types';
import { KindLabel } from '@/components/kind-label';
import { OwnerCell } from '@/components/settings/owner-cell';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const supabase = await getSupabaseServer();
  const { data: channelsData } = await supabase
    .from('channels')
    .select('id, key, name, kind, owner_label, quantum_weekly, quantum_monthly')
    .order('sort_order');

  const channels = (channelsData ?? []) as Pick<
    Channel,
    'id' | 'key' | 'name' | 'kind' | 'owner_label' | 'quantum_weekly' | 'quantum_monthly'
  >[];

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-8 anim-fade-rise">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--brand-cyan)] font-medium mb-2">
          Config
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--ink)]">Settings</h1>
        <p className="text-sm text-[var(--muted)] mt-2">
          Edit each KPI&rsquo;s owner inline below — changes save immediately and
          show up on the Weekly Review. Quantum allocations and metrics_schema
          are still edited via Supabase Studio for now.
        </p>
      </div>

      <Section title={`Channels · ${channels.length}`}>
        <table className="w-full text-sm">
          <thead className="bg-[var(--surface-muted)] border-b border-[var(--border)] text-[var(--muted)]">
            <tr>
              <Th>Key</Th>
              <Th>Name</Th>
              <Th>Kind</Th>
              <Th>KPI Owner</Th>
              <Th align="right">Quantum (W / M)</Th>
            </tr>
          </thead>
          <tbody>
            {channels.map((c, idx) => (
              <tr
                key={c.id}
                className={`row-hover border-b border-[var(--border)] last:border-0 anim-fade-rise stagger-${Math.min(idx, 8)}`}
              >
                <Td className="num text-xs text-[var(--muted)]">{c.key}</Td>
                <Td className="font-medium text-[var(--ink)]">{c.name}</Td>
                <Td><KindLabel kind={c.kind} /></Td>
                <Td className="min-w-[240px]">
                  <OwnerCell channelId={c.id} initialOwner={c.owner_label} />
                </Td>
                <Td align="right" className="num text-[var(--muted)]">
                  <span className="text-[var(--ink)] font-medium">{c.quantum_weekly}</span>
                  <span className="mx-1.5 text-[var(--border-strong)]">/</span>
                  <span>{c.quantum_monthly}</span>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Auth">
        <div className="px-6 py-5 text-sm text-[var(--muted)] space-y-2">
          <p>
            Site is gated by a single shared password. Anyone with the password sees
            and edits everything. To change the password, update the
            <code className="text-xs bg-[var(--surface-muted)] px-1 py-0.5 rounded mx-1">APP_PASSWORD</code>
            env var in Vercel.
          </p>
          <p>
            To rotate sessions for everyone, change
            <code className="text-xs bg-[var(--surface-muted)] px-1 py-0.5 rounded mx-1">SESSION_SECRET</code>
            in Vercel — all current cookies invalidate on next request.
          </p>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-medium text-[var(--ink)] mb-3">{title}</h2>
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-x-auto shadow-[0_1px_2px_rgba(10,24,40,0.04)]">
        {children}
      </div>
    </section>
  );
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th className={`px-4 py-3 text-${align} font-medium text-[10px] uppercase tracking-[0.12em]`}>
      {children}
    </th>
  );
}

function Td({ children, align = 'left', className = '' }: { children: React.ReactNode; align?: 'left' | 'right'; className?: string }) {
  return <td className={`px-4 py-3 text-${align} ${className}`}>{children}</td>;
}
