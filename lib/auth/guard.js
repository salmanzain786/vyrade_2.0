import { NextResponse } from 'next/server';
import { getCurrentUser } from './session.js';
import { captureRouteError, routeOf } from '../monitoring/capture.js';

// Thrown by requireUser; caught by withAuth to produce a 401 response.
export class UnauthorizedError extends Error {
  constructor(message = 'Authentication required') {
    super(message);
    this.name = 'UnauthorizedError';
    this.statusCode = 401;
  }
}

export class ForbiddenError extends Error {
  constructor(message = 'You do not have access to this resource') {
    super(message);
    this.name = 'ForbiddenError';
    this.statusCode = 403;
  }
}

/** Return the authenticated user or throw UnauthorizedError (for API routes). */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

/**
 * Return the authenticated user only if they are an admin. Throws
 * UnauthorizedError (401) when signed out, ForbiddenError (403) when signed in
 * but not an admin — so the admin API surface is never reachable by a normal user.
 */
export async function requireAdmin() {
  const user = await requireUser();
  if (!user.isAdmin) throw new ForbiddenError('Admin access required');
  return user;
}

/**
 * Wrap an API route handler so it runs only for authenticated users. The
 * resolved user is passed as the handler's first argument, followed by the
 * original (request, context) arguments. Auth/authorization errors map to
 * 401/403; everything else to 500.
 *
 *   export const GET = withAuth(async (user, request, { params }) => { ... });
 */
export function withAuth(handler) {
  return withGuard(requireUser, handler);
}

/**
 * Like withAuth, but the handler runs only for ADMIN users. Non-admins get 403,
 * signed-out users 401 — before the handler ever runs.
 *
 *   export const GET = withAdmin(async (user, request) => { ... });
 */
export function withAdmin(handler) {
  return withGuard(requireAdmin, handler);
}

// Shared wrapper: resolve+authorize via `gate`, run the handler, map errors.
function withGuard(gate, handler) {
  return async (request, context) => {
    let user;
    try {
      user = await gate();
    } catch (err) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode || 401 });
    }
    try {
      return await handler(user, request, context);
    } catch (err) {
      const status = err.statusCode || 500;
      if (status >= 500) {
        console.error(err);
        // Report the fault to Sentry with route + user id (no PII, no body).
        captureRouteError(err, { route: routeOf(request), method: request?.method, status, userId: user?.id });
      }
      return NextResponse.json({ error: err.message }, { status });
    }
  };
}
