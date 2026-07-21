/**
 * Server-side Mixpanel tracking — the authoritative half of the pipeline.
 *
 * These events fire from API route handlers, so they are immune to ad-blockers
 * and reflect what actually happened on the backend (a workflow really was
 * generated, an export really was produced, a login really succeeded) along
 * with data the client never sees: token usage, cost, node counts, readiness.
 *
 * Everything here is fire-and-forget and wrapped so analytics can NEVER break a
 * request: a Mixpanel outage or a missing token must not turn into a 500.
 */
import Mixpanel from 'mixpanel';

const TOKEN = process.env.MIXPANEL_TOKEN || process.env.NEXT_PUBLIC_MIXPANEL_TOKEN;
const DEBUG = process.env.NODE_ENV !== 'production';

let _mp = null;
function mp() {
  if (_mp || !TOKEN) return _mp;
  _mp = Mixpanel.init(TOKEN, {
    host: process.env.MIXPANEL_API_HOST || 'api.mixpanel.com',
    // Buffer nothing — serverless invocations are short-lived.
    keepAlive: false,
  });
  return _mp;
}

/**
 * Track a backend event.
 * @param {string} event  event name (use EVENTS.* from ./events.js)
 * @param {object} opts   { distinctId, ...properties }
 *   distinctId should be the user id so server events merge with the client
 *   identity. For pre-auth events (login failed, reset requested) pass the
 *   email so the funnel still stitches together.
 */
export function trackServer(event, { distinctId, ...props } = {}) {
  const client = mp();
  if (!client) {
    if (DEBUG) console.debug('[analytics:server:noop]', event, { distinctId, ...props });
    return;
  }
  try {
    client.track(event, {
      distinct_id: distinctId ? String(distinctId) : 'anonymous',
      // Mixpanel wants a millisecond `time`; default is fine, but stamping it
      // explicitly keeps ordering correct if events are ever queued.
      $insert_id: undefined,
      ...clean(props),
    });
  } catch (err) {
    if (DEBUG) console.warn('[analytics:server] track failed:', event, err?.message);
  }
}

/** Set/merge a person profile (call on signup and login). */
export function setPerson(distinctId, props = {}) {
  const client = mp();
  if (!client || !distinctId) return;
  try {
    client.people.set(String(distinctId), clean(props));
  } catch (err) {
    if (DEBUG) console.warn('[analytics:server] people.set failed:', err?.message);
  }
}

/** Drop undefined/null so we don't ship empty columns to Mixpanel. */
function clean(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v !== undefined && v !== null) out[k] = v;
  }
  return out;
}

export default { trackServer, setPerson };
