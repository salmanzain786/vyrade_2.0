'use client';

/**
 * Client-side Mixpanel wrapper.
 *
 * Design goals:
 *  - Safe no-op when NEXT_PUBLIC_MIXPANEL_TOKEN is unset (local dev, CI, tests)
 *    and during SSR — every export can be called unconditionally.
 *  - Single init, guarded against React StrictMode double-mount.
 *  - Thin, typed-ish surface (track / identify / reset / page view) so call
 *    sites stay tidy and event names come from lib/analytics/events.js.
 */
import mixpanel from 'mixpanel-browser';

const TOKEN = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN;
const DEBUG = process.env.NODE_ENV !== 'production';

let started = false;

/** True only in a browser with a configured token. */
function ready() {
  return typeof window !== 'undefined' && !!TOKEN && started;
}

/** Initialise once. Called by AnalyticsProvider on mount. */
export function initAnalytics() {
  if (started || typeof window === 'undefined' || !TOKEN) return;
  mixpanel.init(TOKEN, {
    debug: DEBUG,
    // Capture page-level context automatically; we still send explicit events.
    track_pageview: false,          // we control this via trackPageView()
    persistence: 'localStorage',
    ignore_dnt: false,              // respect Do-Not-Track
    api_host: process.env.NEXT_PUBLIC_MIXPANEL_API_HOST || 'https://api-js.mixpanel.com',
  });
  started = true;
}

/**
 * Tie the anonymous device to a known user and populate their profile.
 * Idempotent — safe to call on every authenticated mount.
 */
export function identifyUser(user) {
  if (!ready() || !user?.id) return;
  try {
    mixpanel.identify(String(user.id));
    mixpanel.people.set({
      $name: user.name || undefined,
      $email: user.email || undefined,
      email_verified: user.emailVerified ?? undefined,
    });
    // Register super-properties so every subsequent event carries who it was.
    mixpanel.register({ user_id: String(user.id) });
  } catch (err) {
    if (DEBUG) console.warn('[analytics] identify failed:', err?.message);
  }
}

/** Clear identity on sign-out so the next user starts clean. */
export function resetAnalytics() {
  if (!ready()) return;
  try { mixpanel.reset(); } catch { /* ignore */ }
}

/** Track an arbitrary event. Extra properties are optional. */
export function track(event, props = {}) {
  if (!ready()) {
    if (DEBUG && TOKEN == null && typeof window !== 'undefined') {
      // Loud enough to notice in dev, silent in prod.
      console.debug('[analytics:noop]', event, props);
    }
    return;
  }
  try { mixpanel.track(event, props); } catch (err) {
    if (DEBUG) console.warn('[analytics] track failed:', event, err?.message);
  }
}

/** Track a page view with a normalised path. */
export function trackPageView(path, props = {}) {
  track('Page Viewed', { path, ...props });
}

export default { initAnalytics, identifyUser, resetAnalytics, track, trackPageView };
