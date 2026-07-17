import { NextResponse } from 'next/server';

/**
 * Uniform error response for the auth routes. Any error carrying a statusCode
 * (AuthError 4xx, RateLimitError 429) is surfaced as-is; anything else is an
 * unexpected server fault and is logged, never leaked.
 */
export function authErrorResponse(err, fallback = 'Request failed', extraBody = {}) {
  if (err?.statusCode) {
    return NextResponse.json(
      { error: err.message, ...extraBody },
      {
        status: err.statusCode,
        // Tell a throttled client when to come back.
        ...(err.retryAfter ? { headers: { 'Retry-After': String(err.retryAfter) } } : {}),
      }
    );
  }
  console.error(err);
  return NextResponse.json({ error: fallback }, { status: 500 });
}
