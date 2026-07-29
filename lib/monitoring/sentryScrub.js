/**
 * Sentry privacy hardening — shared across client / server / edge init.
 *
 * Sentry is a third party, and this app handles Blueprint text, workflow JSON,
 * emails and credentials — none of which may leave our systems (same rule as
 * lib/analytics/sanitize.js). The Sentry SDK, left at wizard defaults, will
 * attach request bodies, cookies, query strings and user email. `scrubEvent`
 * strips all of that BEFORE the event is sent, so only the stack trace + safe
 * technical context ever reaches Sentry.
 *
 * Pure module — no Node/browser-only APIs — so client, server and edge can all
 * import it.
 */

// Headers we keep (everything else — cookie, authorization, x-api-key… — dropped).
const SAFE_HEADERS = new Set(['user-agent', 'content-type', 'accept-language']);

/** Remove the query string (may carry tokens/ids) from a URL string. */
function stripQuery(url) {
  if (typeof url !== 'string') return url;
  const i = url.indexOf('?');
  return i === -1 ? url : url.slice(0, i);
}

/**
 * Strip PII / payloads from a Sentry event in place, then return it.
 * Return `null` to drop an event entirely (not used here, but supported).
 */
export function scrubEvent(event) {
  if (!event || typeof event !== 'object') return event;

  // 1) Request: drop body, cookies, query string; keep method + bare URL + a
  //    couple of harmless headers.
  if (event.request) {
    const r = event.request;
    delete r.data;            // POST/PUT body — could be a whole Blueprint
    delete r.cookies;         // session cookies
    delete r.query_string;    // may carry tokens/emails
    if (r.url) r.url = stripQuery(r.url);
    if (r.headers && typeof r.headers === 'object') {
      const kept = {};
      for (const [k, v] of Object.entries(r.headers)) {
        if (SAFE_HEADERS.has(String(k).toLowerCase())) kept[k] = v;
      }
      r.headers = kept;
    }
  }

  // 2) User: keep only a stable id — never email / ip / username.
  if (event.user) {
    event.user = event.user.id ? { id: event.user.id } : {};
  }
  // Belt-and-suspenders: never let Sentry attach a server-inferred IP.
  event.user = event.user || {};
  event.user.ip_address = null;

  // 3) Breadcrumbs: console logs in this app can contain raw data — drop them;
  //    strip query strings from navigation/http breadcrumbs.
  if (Array.isArray(event.breadcrumbs)) {
    event.breadcrumbs = event.breadcrumbs
      .filter((b) => b && b.category !== 'console')
      .map((b) => {
        if (b?.data?.url) b.data.url = stripQuery(b.data.url);
        if (typeof b?.data?.from === 'string') b.data.from = stripQuery(b.data.from);
        if (typeof b?.data?.to === 'string') b.data.to = stripQuery(b.data.to);
        return b;
      });
  }

  return event;
}

/**
 * The options every Sentry.init shares. DSN is env-driven (with the project
 * default), reporting is gated to production (or SENTRY_ENABLE_DEV=1 for a
 * local test), traces are sampled down in prod, PII is off, and every event is
 * scrubbed. Release ties to the deploy SHA for regression tracking.
 */
export function baseSentryOptions(extra = {}) {
  const dsn =
    process.env.NEXT_PUBLIC_SENTRY_DSN ||
    process.env.SENTRY_DSN ||
    'https://e0b8c74206fa688b18cd9ab43151574e@o4511819036622848.ingest.de.sentry.io/4511819040030800';
  const isProd = process.env.NODE_ENV === 'production';

  return {
    dsn,
    // Don't spam the project from local dev unless explicitly opted in.
    enabled: Boolean(dsn) && (isProd || process.env.SENTRY_ENABLE_DEV === '1'),
    environment: process.env.SENTRY_ENV || process.env.NODE_ENV || 'development',
    // Regression tracking (milestone 1.5): pin each event to the deploy SHA.
    // The build plugin also auto-detects this from git; the env wins if set.
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE || process.env.SENTRY_RELEASE || undefined,
    // 100% traces are expensive; sample down in prod, full in dev testing.
    tracesSampleRate: isProd ? 0.1 : 1,
    // Never let the SDK attach cookies / bodies / user IP automatically.
    sendDefaultPii: false,
    // Console logs in this app can carry raw Blueprint/tool text — don't ship them.
    enableLogs: false,
    // Final safety net: strip PII from every outbound event.
    beforeSend: (event) => scrubEvent(event),
    ...extra,
  };
}

export default { scrubEvent, baseSentryOptions };
