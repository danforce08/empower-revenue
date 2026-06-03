'use server';

import { revalidatePath } from 'next/cache';
import { getSupabaseServer } from '@/lib/supabase/server';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Update a channel's KPI owner label.
 *
 * Auth is enforced by proxy.ts (every non-login route requires the shared-
 * password session), so this only runs for authenticated users. The write
 * goes through the server (service-role) Supabase client — never the browser —
 * which is also what keeps working once RLS denies the public anon role.
 */
export async function updateChannelOwner(
  id: string,
  ownerLabel: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!UUID_RE.test(id)) {
    return { ok: false, error: 'Invalid channel id' };
  }
  // Empty / whitespace clears the owner (stored as NULL → renders as "—").
  const normalized = (ownerLabel ?? '').trim() || null;

  const supabase = await getSupabaseServer();
  const { error } = await supabase
    .from('channels')
    .update({ owner_label: normalized })
    .eq('id', id);

  if (error) {
    return { ok: false, error: error.message };
  }

  // KPI owners surface on Weekly Review, the channel detail page, and here.
  revalidatePath('/settings');
  revalidatePath('/');
  revalidatePath(`/channel/${id}`);
  return { ok: true };
}
