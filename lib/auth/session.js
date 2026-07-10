import { cookies } from 'next/headers';
import { createToken, verifyToken } from './token.js';
import { getUserById } from '../services/authRepository.js';

// Session cookie plumbing. The cookie holds an HMAC-signed token carrying only
// the user id; the full user record is re-read from the DB on each request so a
// deleted/changed user can't keep acting on a stale token.

export const SESSION_COOKIE = 'vyrade_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
};

/** Issue a session cookie for a user id (call inside a route handler). */
export function setSessionCookie(userId) {
  const token = createToken({ uid: userId }, SESSION_TTL_SECONDS);
  cookies().set(SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_TTL_SECONDS });
}

/** Clear the session cookie (logout). */
export function clearSessionCookie() {
  cookies().set(SESSION_COOKIE, '', { ...cookieOptions, maxAge: 0 });
}

/**
 * Resolve the current user from the session cookie, or null. Safe to call in
 * server components and route handlers. Never throws on a missing/invalid
 * cookie — only on genuine DB failure.
 */
export async function getCurrentUser() {
  const raw = cookies().get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const payload = verifyToken(raw);
  if (!payload?.uid) return null;

  const user = await getUserById(payload.uid);
  if (!user) return null;
  return { id: user.id, name: user.name, email: user.email, emailVerified: !!user.emailVerified };
}
