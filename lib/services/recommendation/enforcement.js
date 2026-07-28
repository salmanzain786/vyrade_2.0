/**
 * Policy: is "recommendation-before-export" strictly enforced?
 *
 * Strict → a COMPLETE Blueprint that cannot produce/persist a recommendation
 * BLOCKS the build/export (409). Non-strict → the build proceeds but the
 * response carries an `export_warning` (provenance loss is never silent).
 *
 * Default is production-grade: strict in production, lenient elsewhere — with an
 * explicit env override in either direction:
 *   STRICT_RECOMMENDATION_BEFORE_EXPORT=true   → always strict
 *   STRICT_RECOMMENDATION_BEFORE_EXPORT=false  → always lenient
 *   (unset)                                    → strict iff NODE_ENV=production
 */
export function isStrictRecommendationEnforced() {
  const flag = process.env.STRICT_RECOMMENDATION_BEFORE_EXPORT;
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  return process.env.NODE_ENV === 'production';
}

export default { isStrictRecommendationEnforced };
