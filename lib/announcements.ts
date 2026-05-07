import { getSupabaseServer } from '@/lib/supabase/server';

/**
 * Returns the raw body of the singleton announcements row. The client editor
 * decides how to render it (stripping the leading "# Announcements" header
 * and hiding the section when the body collapses to whitespace).
 */
export async function getAnnouncementsBody(): Promise<string> {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from('announcements')
    .select('body')
    .eq('id', 1)
    .maybeSingle();
  if (error || !data) return '';
  return data.body ?? '';
}
