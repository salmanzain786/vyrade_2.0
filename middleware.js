import { NextResponse } from 'next/server';

// Edge middleware: a fast, coarse gate that redirects signed-out visitors to
// /login before a protected page renders. It only checks that a non-expired
// session cookie is PRESENT — the cryptographic signature is verified
// server-side (server components + every API route via withAuth), which is the
// real security boundary. This keeps the middleware dependency-free and cheap.

const SESSION_COOKIE = 'vyrade_session';

// Paths reachable while signed out. Everything else requires a session.
const PUBLIC_PAGES = ['/login', '/register', '/verify-email', '/forgot-password', '/reset-password'];

function looksLikeLiveSession(token) {
  if (!token || !token.includes('.')) return false;
  try {
    const payloadB64 = token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(payloadB64);
    const payload = JSON.parse(json);
    return !!payload?.exp && payload.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export function middleware(request) {
  const { pathname } = request.nextUrl;

  // API routes enforce their own auth and must return JSON (401), never an
  // HTML redirect — so the middleware page gate never touches them.
  if (pathname.startsWith('/api/')) return NextResponse.next();

  const isPublicPage = PUBLIC_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const hasSession = looksLikeLiveSession(request.cookies.get(SESSION_COOKIE)?.value);

  if (!hasSession && !isPublicPage) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

// Run on everything except Next internals and static assets. API routes are
// included so unauthenticated API calls short-circuit here too (auth APIs are
// re-allowed above).
export const config = {
  // Skip Next internals and static assets (fonts/images/etc.) so the login page
  // can load them while signed out. `/api` is handled in the function body.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|otf|css|js|map)$).*)',
  ],
};
