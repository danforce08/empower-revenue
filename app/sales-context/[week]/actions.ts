'use server';

import { revalidatePath } from 'next/cache';
import { setPublished, setReportBody } from '@/lib/sales-context/reports';

/**
 * Flip the `published` flag on a sales-context report. Auth is enforced by
 * proxy.ts (every non-login route requires the shared-password session
 * cookie), so this action runs only for authenticated dashboard users.
 */
export async function publishReport(formData: FormData): Promise<void> {
  const slug = String(formData.get('slug') ?? '').trim();
  const published = formData.get('published') === 'true';
  if (!/^\d{4}-W\d{2}$/.test(slug)) {
    throw new Error(`Invalid slug: ${slug}`);
  }
  await setPublished(slug, published);
  revalidatePath(`/sales-context/${slug}`);
  revalidatePath('/sales-context');
}

/**
 * Replace a report's markdown body with new content. Frontmatter (week,
 * date_range, generated_at, pipeline, published, …) is preserved. Auth
 * is enforced by proxy.ts the same way as `publishReport`.
 */
export async function editReportBody(formData: FormData): Promise<void> {
  const slug = String(formData.get('slug') ?? '').trim();
  const body = String(formData.get('body') ?? '');
  if (!/^\d{4}-W\d{2}$/.test(slug)) {
    throw new Error(`Invalid slug: ${slug}`);
  }
  await setReportBody(slug, body);
  revalidatePath(`/sales-context/${slug}`);
  revalidatePath('/sales-context');
}
