import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

// Next.js 16: proxy.ts replaces middleware.ts. Always runs on Node runtime
// (no runtime config allowed). Matcher excludes static + image assets,
// including any file under /public/ (svg/png/jpg/woff/etc.).
export const config = {
  matcher: [
    // Exclude common static asset extensions so /public/* serves cleanly. We
    // intentionally still gate `.html` (the forecast-tool iframe target) so it
    // requires the same shared-password session as the rest of the app.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|otf)$).*)',
  ],
};

export async function proxy(request: NextRequest) {
  return updateSession(request);
}
