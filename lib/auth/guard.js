import { NextResponse } from 'next/server';
import { getCurrentUser } from './session.js';

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
 * Wrap an API route handler so it runs only for authenticated users. The
 * resolved user is passed as the handler's first argument, followed by the
 * original (request, context) arguments. Auth/authorization errors map to
 * 401/403; everything else to 500.
 *
 *   export const GET = withAuth(async (user, request, { params }) => { ... });
 */
export function withAuth(handler) {
  return async (request, context) => {
    let user;
    try {
      user = await requireUser();
    } catch (err) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode || 401 });
    }
    try {
      return await handler(user, request, context);
    } catch (err) {
      const status = err.statusCode || 500;
      if (status >= 500) console.error(err);
      return NextResponse.json({ error: err.message }, { status });
    }
  };
}
