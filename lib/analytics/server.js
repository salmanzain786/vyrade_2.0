/**
 * Server-side Mixpanel tracking — the authoritative half of the pipeline.
 *
 * Fires from API route handlers, so it's immune to ad-blockers and reflects
 * what actually happened on the backend, along with data the client never sees
 * (token usage, cost, node counts, readiness).
 *
 * PRIVACY (hard rules):
 *   • Every property goes through the strict allowlist in ./sanitize.js. Raw
 *     Blueprint text, user messages, workflow JSON, emails, credentials, CRM
 *     data, DB URLs and error stacks can never leave this process.
 *   • distinct_id is a user id for signed-in events. For pre-auth events
 *     (failed login, reset request) the email is HMAC-pseudonymized to a stable
 *     `anon_…` id so the funnel still stitches WITHOUT exposing the address.
 *     Raw email is never used as an identifier and never sent as a property.
 *   • Person-profile PII ($email/$name) is only sent when ANALYTICS_ALLOW_PII
 *     is explicitly enabled; off by default.
 *
 * Fire-and-forget and wrapped so analytics can NEVER break a request.
 */
import Mixpanel from 'mixpanel';
import { createHmac } from 'node:crypto';
import { authSecret } from '../auth/secret.js';
import { sanitizeProps } from './sanitize.js';

const TOKEN = process.env.MIXPANEL_TOKEN || process.env.NEXT_PUBLIC_MIXPANEL_TOKEN;
const DEBUG = process.env.NODE_ENV !== 'production';
const ALLOW_PII = process.env.ANALYTICS_ALLOW_PII === 'true';

let _mp = null;
function mp() {
  if (_mp || !TOKEN) return _mp;
  _mp = Mixpanel.init(TOKEN, {
    host: process.env.MIXPANEL_API_HOST || 'api.mixpanel.com',
    keepAlive: false, // serverless invocations are short-lived
  });
  return _mp;
}

const looksLikeEmail = (s) => typeof s === 'string' && s.includes('@');

/** Stable, non-reversible pseudonym for a pre-auth identifier (e.g. email). */
function anonId(seed) {
  try {
    const h = createHmac('sha256', authSecret()).update(String(seed)).digest('hex');
    return `anon_${h.slice(0, 24)}`;
  } catch {
    return 'anonymous'; // no secret configured → don't leak, don't crash
  }
}

/**
 * Resolve a safe distinct_id. Never returns a raw email.
 *  - signed-in  → the user id
 *  - pre-auth   → HMAC(email) as `anon_…`
 *  - otherwise  → 'anonymous'
 */
function resolveDistinctId({ userId, email, distinctId }) {
  if (userId) return String(userId);
  if (distinctId && !looksLikeEmail(distinctId)) return String(distinctId);
  const seed = email || (looksLikeEmail(distinctId) ? distinctId : null);
  return seed ? anonId(seed) : 'anonymous';
}

/**
 * Track a backend event.
 * @param {string} event
 * @param {object} opts  { userId?, email?, distinctId?, ...properties }
 *   Pass `userId` for signed-in events, `email` for pre-auth ones (it is only
 *   used to derive the pseudonymous id — never sent). Properties are allowlisted.
 */
export function trackServer(event, { userId = null, email = null, distinctId = null, ...props } = {}) {
  const clean = sanitizeProps(props);
  const client = mp();
  if (!client) {
    if (DEBUG) console.debug('[analytics:server:noop]', event, clean);
    return;
  }
  try {
    client.track(event, { distinct_id: resolveDistinctId({ userId, email, distinctId }), ...clean });
  } catch (err) {
    if (DEBUG) console.warn('[analytics:server] track failed:', event, err?.message);
  }
}

/**
 * Set/merge a person profile (call on signup and login).
 * Only allowlisted, non-PII properties are sent by default; $email/$name are
 * included solely when ANALYTICS_ALLOW_PII is enabled.
 */
export function setPerson(userId, props = {}) {
  const client = mp();
  if (!client || !userId) return;
  const safe = sanitizeProps(props);
  if (ALLOW_PII) {
    if (props.$email) safe.$email = props.$email;
    if (props.$name) safe.$name = props.$name;
  }
  try {
    client.people.set(String(userId), safe);
  } catch (err) {
    if (DEBUG) console.warn('[analytics:server] people.set failed:', err?.message);
  }
}

export default { trackServer, setPerson };
