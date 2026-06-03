'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Auto-refreshes the dashboard on a fixed interval so numbers update during
 * the weekly revenue call without a manual reload.
 *
 * Previously this subscribed to Supabase Realtime from the browser using the
 * anon key, which required the public `anon` role to have read access to
 * `metrics` — exactly the exposure RLS now closes. Realtime no longer
 * delivers events to anon, so we poll with router.refresh() instead. No
 * database credential touches the browser.
 */
const REFRESH_MS = 30_000;

export function RealtimeRefresher() {
  const router = useRouter();
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setPulse((p) => p + 1);
      router.refresh();
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [router]);

  return (
    <span
      key={pulse}
      className="chip bg-emerald-50 text-emerald-700 transition-colors"
      title={`Auto-refreshing every ${REFRESH_MS / 1000}s`}
    >
      <span
        className="inline-block w-1.5 h-1.5 rounded-full mr-1 bg-emerald-500"
        style={{ boxShadow: '0 0 0 0 rgba(16, 185, 129, 0.6)', animation: 'pulse-soft 2s infinite' }}
      />
      Live
    </span>
  );
}
