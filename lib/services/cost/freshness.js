/**
 * Cost Intelligence — pricing freshness rule.
 *
 * Seeded/curated prices go stale fast. This module makes age a first-class part
 * of the estimate so old numbers can't silently become "truth":
 *
 *     0–30 days   → current       (no penalty)
 *     31–90 days  → needs_review  (confidence capped at 'medium')
 *     90+ days    → stale         ("Price may be outdated"; capped at 'low')
 *     no date     → unknown       (no age penalty; governance still applies)
 *
 * `now` is injectable so the logic is pure and testable (callers pass one clock
 * per request rather than each line reading the wall clock independently).
 */

export const FRESHNESS = {
  CURRENT: 'current',
  NEEDS_REVIEW: 'needs_review',
  STALE: 'stale',
  UNKNOWN: 'unknown',
};

export const FRESHNESS_THRESHOLDS = { needsReviewAfterDays: 30, staleAfterDays: 90 };

const DAY_MS = 86_400_000;
const RANK = { unknown: 0, low: 1, medium: 2, high: 3 };
const toStr = (r) => Object.keys(RANK).find((k) => RANK[k] === r) || 'unknown';

/** Classify a `last_checked` timestamp. @returns {{status, age_days}} */
export function freshnessOf(lastChecked, now = Date.now()) {
  if (!lastChecked) return { status: FRESHNESS.UNKNOWN, age_days: null };
  const t = new Date(lastChecked).getTime();
  if (Number.isNaN(t)) return { status: FRESHNESS.UNKNOWN, age_days: null };

  const ageDays = Math.max(0, Math.floor((now - t) / DAY_MS));
  let status = FRESHNESS.CURRENT;
  if (ageDays > FRESHNESS_THRESHOLDS.staleAfterDays) status = FRESHNESS.STALE;
  else if (ageDays > FRESHNESS_THRESHOLDS.needsReviewAfterDays) status = FRESHNESS.NEEDS_REVIEW;
  return { status, age_days: ageDays };
}

/**
 * Cap a price's confidence by how stale it is. A high-confidence official price
 * that hasn't been re-checked in 3 months is no longer high-confidence.
 */
export function agedConfidence(confidence, status) {
  const cap =
    status === FRESHNESS.STALE ? 'low'
    : status === FRESHNESS.NEEDS_REVIEW ? 'medium'
    : 'high'; // current / unknown → no age cap
  return toStr(Math.min(RANK[confidence] ?? 0, RANK[cap]));
}

/** User-facing warning for a freshness status (null when nothing to say). */
export function freshnessLabel(status) {
  if (status === FRESHNESS.STALE) return 'Price may be outdated';
  if (status === FRESHNESS.NEEDS_REVIEW) return 'Price may need review';
  return null;
}

export default { FRESHNESS, FRESHNESS_THRESHOLDS, freshnessOf, agedConfidence, freshnessLabel };
