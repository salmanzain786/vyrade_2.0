/**
 * The one accessor for AUTH_SECRET. Session tokens, reset tokens, and OTP
 * hashing all key off it, so it lives in a single place rather than being
 * re-read (and re-validated) per module.
 */
export function authSecret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) {
    throw new Error(
      'AUTH_SECRET is not set (min 16 chars). Add it to your .env — see .env.example.'
    );
  }
  return s;
}
