/**
 * Server-side error capture for API routes (milestone 1.3).
 *
 * Reports an uncaught route exception to Sentry with just enough context to be
 * actionable — the route, HTTP method, status, and the signed-in user's ID —
 * and NOTHING that could leak PII. Any custom `extra` is pushed through the
 * analytics allowlist (lib/analytics/sanitize.js), so a Blueprint/email/URL
 * can't ride along. Expected client errors (4xx) are not reported.
 */
import * as Sentry from '@sentry/nextjs';
import { sanitizeProps } from '../analytics/sanitize.js';

/** Pathname only (no query string) from a Request, for a route tag. */
export function routeOf(request) {
  try {
    return new URL(request.url).pathname;
  } catch {
    return null;
  }
}

/**
 * @param {Error} err
 * @param {{route?, method?, status?, userId?, extra?}} ctx
 */
export function captureRouteError(err, { route, method, status, userId, extra } = {}) {
  // Only surface genuine server faults; 401/403/404/409 etc. are expected.
  if (status && status < 500) return;
  try {
    Sentry.withScope((scope) => {
      if (route) scope.setTag('route', route);
      if (method) scope.setTag('http.method', method);
      if (status) scope.setTag('status_code', String(status));
      scope.setUser(userId ? { id: userId } : null);
      if (extra) scope.setContext('safe_context', sanitizeProps(extra));
      Sentry.captureException(err);
    });
  } catch {
    // Monitoring must never break the request it observes.
  }
}

export default { captureRouteError, routeOf };
