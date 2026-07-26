/**
 * Query-param validation for the cost API route. Pure + tested so the route
 * stays thin and the rules are locked down (a cost response can reveal a user's
 * systems, tools, volume and automation design, so inputs are validated
 * strictly rather than coerced).
 */

// Sanity ceiling — a monthly volume above this is almost certainly a mistake or
// an attempt to blow up the arithmetic; reject rather than compute nonsense.
export const MAX_MONTHLY_RUNS = 1_000_000_000;

/**
 * Validate an optional `monthlyRuns` override.
 * @returns {{ value: number|null }} when valid/absent, or {{ error: string }}.
 */
export function parseVolumeOverride(raw) {
  if (raw == null || raw === '') return { value: null }; // absent → use Blueprint volume
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n > MAX_MONTHLY_RUNS) {
    return { error: `monthlyRuns must be a positive number no greater than ${MAX_MONTHLY_RUNS}.` };
  }
  return { value: Math.floor(n) };
}

/**
 * Validate an optional `version`. Absent → caller uses the current version.
 * @returns {{ value: number|null }} when valid/absent, or {{ error: string }}.
 */
export function parseVersion(raw) {
  if (raw == null || raw === '') return { value: null }; // absent → current version
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    return { error: 'version must be a positive integer.' };
  }
  return { value: n };
}

export default { MAX_MONTHLY_RUNS, parseVolumeOverride, parseVersion };
