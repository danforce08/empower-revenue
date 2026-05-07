import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE_NAME, verifyToken } from '@/lib/session';

const PUBLIC_PATHS = new Set(['/login']);
const PUBLIC_API_PREFIXES = ['/api/auth/login', '/api/auth/logout'];

export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname;

  if (
    PUBLIC_PATHS.has(path) ||
    PUBLIC_API_PREFIXES.some((p) => path.startsWith(p)) ||
    path.startsWith('/_next') ||
    path.startsWith('/favicon')
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!verifyToken(token)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}
