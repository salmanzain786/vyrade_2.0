/**
 * Individual AI Adoption Score (Phase 1.4).
 *
 * A DIRECTIONAL index (0–100), NOT a scientifically-exact measurement — per the
 * spec's explicit caution. It is a weighted blend of signals Vyrade can actually
 * observe. The weights live here as an adjustable, documented config (expect to
 * retune after real usage) — deliberately NOT buried in the UI layer.
 *
 * Every input signal is normalised to 0..1 by the caller; this module only
 * blends + explains, so the formula is easy to reason about and change.
 */

// Weights sum to 1.0. Change here to retune; the breakdown surfaces each
// signal's contribution so the score is never a black box.
export const WEIGHTS = {
  opportunities_explored: 0.15, // breadth of the map actually engaged with
  blueprints_started: 0.15,     // moved from idea → design
  blueprints_completed: 0.20,   // reached a ready, buildable design
  implementations_prepared: 0.15, // generated/exported a workflow
  active_workflows: 0.10,       // confirmed running (Phase 3; 0 until then)
  responsibility_breadth: 0.08, // how much of the role's map is covered
  governance_completion: 0.09,  // avg governance readiness of their blueprints
  skills_readiness: 0.08,       // self-rated skill × engagement complexity
};

// Directional maturity bands. Names, not exact thresholds — the point is a
// sense of stage, not a decimal.
export const BANDS = [
  { min: 0, key: 'exploring', label: 'Exploring' },
  { min: 20, key: 'aware', label: 'Aware' },
  { min: 40, key: 'building', label: 'Building' },
  { min: 60, key: 'adopting', label: 'Adopting' },
  { min: 80, key: 'leading', label: 'Leading' },
];

const SIGNAL_LABEL = {
  opportunities_explored: 'Opportunities explored',
  blueprints_started: 'Blueprints started',
  blueprints_completed: 'Blueprints completed',
  implementations_prepared: 'Implementations prepared',
  active_workflows: 'Confirmed-active workflows',
  responsibility_breadth: 'Breadth of coverage',
  governance_completion: 'Governance completion',
  skills_readiness: 'Skills & readiness',
};

const clamp01 = (v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

// Directional normalisation targets — a raw count that reads as "fully doing
// this". Adjustable config; the SINGLE source of truth for turning raw activity
// counts into 0..1 signals, shared by the individual dashboard AND the org
// department rollup so both compute an identical score.
export const SIGNAL_TARGETS = { blueprints_started: 3, blueprints_completed: 3, implementations_prepared: 2 };
export const SKILL_VALUE = { no_code: 0.35, low_code: 0.6, technical: 0.8, developer: 1.0 };
const norm = (n, target) => Math.min(1, (Number(n) || 0) / target);

/** Raw per-user activity counts → the 0..1 signals computeAdoptionScore expects. */
export function buildAdoptionSignals({ started = 0, completed = 0, prepared = 0, govAvg = null, engaged = 0, total = 0, activeWorkflows = 0, skill = null } = {}) {
  const explored = total ? engaged / total : 0;
  return {
    opportunities_explored: explored,
    blueprints_started: norm(started, SIGNAL_TARGETS.blueprints_started),
    blueprints_completed: norm(completed, SIGNAL_TARGETS.blueprints_completed),
    implementations_prepared: norm(prepared, SIGNAL_TARGETS.implementations_prepared),
    active_workflows: activeWorkflows ? 1 : 0,
    responsibility_breadth: explored,
    governance_completion: govAvg == null ? 0 : govAvg / 100,
    // Known skill → its value; an unrecognised label → 0.3; NO skill/profile → 0
    // (so a brand-new user with nothing honestly reads 0, not a phantom baseline).
    skills_readiness: skill ? (SKILL_VALUE[skill] ?? 0.3) : 0,
  };
}

export function bandFor(score) {
  let band = BANDS[0];
  for (const b of BANDS) if (score >= b.min) band = b;
  return band;
}

/**
 * @param {Record<keyof WEIGHTS, number>} signals  each 0..1
 * @returns {{score, band, caveat, breakdown:Array}}
 */
export function computeAdoptionScore(signals = {}) {
  const breakdown = Object.entries(WEIGHTS).map(([key, weight]) => {
    const value = clamp01(signals[key]);
    return {
      key,
      label: SIGNAL_LABEL[key] || key,
      value,                                   // 0..1
      weight,
      contribution: Math.round(value * weight * 100), // points toward the 0..100 score
    };
  });
  const raw = breakdown.reduce((s, b) => s + b.value * b.weight, 0); // 0..1
  const score = Math.round(raw * 100);
  const band = bandFor(score);

  return {
    score,
    band: band.key,
    band_label: band.label,
    caveat: 'A directional index, not a precise measurement — it reflects the adoption signals Vyrade can observe (opportunities, blueprints, implementations, governance, skills), and will be refined as real usage and telemetry (Phase 4) come online.',
    breakdown,
  };
}

export default { WEIGHTS, BANDS, computeAdoptionScore, bandFor };
