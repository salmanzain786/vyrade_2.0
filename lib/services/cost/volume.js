/**
 * Cost Intelligence — Phase 1: volume normalisation.
 *
 * Every metered cost (tasks, operations, executions, tokens) scales with how
 * often the automation runs. The Blueprint states volume as
 * `{ estimated_executions, period, confidence }`, where period is one of
 * day | week | month | year | event | unknown — so we normalise everything to a
 * single figure: monthly_runs.
 *
 * QA rule: "No volume provided → ask the user or use a default assumption with
 * LOW confidence." We never silently invent a number and present it as fact —
 * when we fall back to a default, `assumed` is true and confidence drops.
 */
import { CONFIDENCE } from './taxonomy.js';

// Multipliers to convert a period's count into a monthly figure. 'event' means
// "per triggering event" — without an event rate we can't derive a monthly
// number, so it's treated as unknown and defaulted.
const PER_MONTH = { day: 30, week: 4.345, month: 1, year: 1 / 12 };

// Default when the user hasn't given a volume. Intentionally modest so we don't
// scare users with a huge number we made up — and always LOW confidence.
export const DEFAULT_MONTHLY_RUNS = 1000;

/**
 * @param {object} volume  blueprint.volume  ({ estimated_executions, period, confidence })
 * @param {number|null} override  explicit monthly runs the user supplied in the UI
 * @returns {{
 *   monthly_runs: number, assumed: boolean, confidence: string,
 *   basis: string, source_period: string|null
 * }}
 */
export function normalizeMonthlyRuns(volume, override = null) {
  // 1) An explicit user-supplied monthly figure always wins and is trusted.
  if (Number.isFinite(override) && override > 0) {
    return {
      monthly_runs: Math.round(override),
      assumed: false,
      confidence: CONFIDENCE.HIGH,
      basis: `User-provided volume: ${Math.round(override).toLocaleString()} runs/month.`,
      source_period: 'month',
    };
  }

  const count = volume?.estimated_executions;
  const period = volume?.period;
  const multiplier = period ? PER_MONTH[period] : undefined;

  // 2) A usable stated volume with a convertible period.
  if (Number.isFinite(count) && count > 0 && multiplier !== undefined) {
    const monthly = Math.max(1, Math.round(count * multiplier));
    // Carry the Blueprint's own confidence in the volume, but never claim more
    // than 'medium' from a stated estimate — it's still an estimate.
    const stated = volume?.confidence;
    const confidence =
      stated === 'user_stated' ? CONFIDENCE.MEDIUM
      : stated === 'unknown' || stated == null ? CONFIDENCE.LOW
      : CONFIDENCE.LOW;
    return {
      monthly_runs: monthly,
      assumed: false,
      confidence,
      basis: `${count.toLocaleString()} per ${period} → ~${monthly.toLocaleString()} runs/month.`,
      source_period: period,
    };
  }

  // 3) Nothing usable (missing, zero, or 'event'/'unknown' period) → default.
  return {
    monthly_runs: DEFAULT_MONTHLY_RUNS,
    assumed: true,
    confidence: CONFIDENCE.LOW,
    basis: `No usable volume stated — assumed ${DEFAULT_MONTHLY_RUNS.toLocaleString()} runs/month (low confidence). Provide a real volume to refine this.`,
    source_period: period || null,
  };
}

export default { normalizeMonthlyRuns, DEFAULT_MONTHLY_RUNS };
