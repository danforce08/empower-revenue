'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowser } from '@/lib/supabase/client';

/**
 * Subscribes to live changes on `metrics` (and optionally `forecasts`) and
 * calls `router.refresh()` whenever a row changes — so the dashboard updates
 * without manual reload during the weekly revenue call. Renders a tiny
 * "live" indicator chip.
 */
export function RealtimeRefresher() {
  const router = useRouter();
  const [connected, setConnected] = useState(false);
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    const channel = supabase
      .channel('dashboard-metrics')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'metrics' },
        () => {
          setPulse((p) => p + 1);
          router.refresh();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'forecasts' },
        () => {
          setPulse((p) => p + 1);
          router.refresh();
        },
      )
      .subscribe((status) => {
        setConnected(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  return (
    <span
      key={pulse}
      className={`chip transition-colors ${
        connected
          ? 'bg-emerald-50 text-emerald-700'
          : 'bg-[var(--surface-muted)] text-[var(--muted)]'
      }`}
      title={connected ? 'Live — updates push automatically' : 'Connecting…'}
    >
      <span
        className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${
          connected ? 'bg-emerald-500 anim-fade-in' : 'bg-[var(--border-strong)]'
        }`}
        style={connected ? { boxShadow: '0 0 0 0 rgba(16, 185, 129, 0.6)', animation: 'pulse-soft 2s infinite' } : undefined}
      />
      {connected ? 'Live' : 'Connecting'}
    </span>
  );
}
