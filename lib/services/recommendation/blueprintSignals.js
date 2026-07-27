/**
 * Recommendation Engine — signal extraction.
 *
 * Reduces an Automation Blueprint to the handful of signals the scorer needs:
 * complexity, volume, branching, AI requirement, human approval, hosting
 * preference, technical skill, cost sensitivity, security sensitivity, and any
 * hard platform constraints the user stated. Pure + deterministic.
 */
import { normalizeMonthlyRuns } from '../cost/volume.js';
import { normalizePlatformToken } from './platformCapabilities.js';

const AI_ACTIONS = new Set(['ai_reasoning', 'generate_content']);

/** Best-effort normalise a free-text technical-skill constraint. */
export function normalizeSkill(raw) {
  const s = String(raw || '').toLowerCase();
  if (!s) return 'unknown';
  if (/(developer|engineer|programmer|technical team|can code|coding|software)/.test(s)) return 'developer';
  if (/(non[- ]?technical|no code|no-code|business user|ops team|not technical|beginner)/.test(s)) return 'non_technical';
  if (/(some|intermediate|basic|low-code|citizen)/.test(s)) return 'some';
  return 'unknown';
}

function tokenSet(list) {
  const out = new Set();
  for (const name of list || []) {
    const t = normalizePlatformToken(name);
    if (t) out.add(t);
  }
  return out;
}

/**
 * @param {object} blueprint
 * @param {object} [opts]  { monthlyRuns } — explicit volume override
 * @returns {object} signals
 */
export function extractSignals(blueprint, { monthlyRuns = null } = {}) {
  const bp = blueprint || {};
  const steps = Array.isArray(bp.process_steps) ? bp.process_steps : [];
  const systems = Array.isArray(bp.systems) ? bp.systems : [];
  const rules = Array.isArray(bp.business_rules) ? bp.business_rules : [];
  const exceptions = Array.isArray(bp.exception_rules) ? bp.exception_rules : [];
  const constraints = bp.constraints || {};
  const ic = constraints.implementation_constraints || {};

  const systemCount = new Set(systems.map((s) => (s?.name || '').toLowerCase()).filter(Boolean)).size;
  const decisionSteps = steps.filter((s) => s?.action_type === 'business_decision').length;
  const branchingCount = rules.length + exceptions.length + decisionSteps;
  const aiStepCount = steps.filter((s) => AI_ACTIONS.has(s?.action_type)).length;

  const vol = normalizeMonthlyRuns(bp.volume, monthlyRuns);
  const runs = vol.monthly_runs;
  const volumeTier = runs > 50_000 ? 'high' : runs >= 1_000 ? 'medium' : 'low';

  const humanApproval =
    bp.human_approval?.required === true ||
    (bp.human_approval?.approval_points?.length ?? 0) > 0 ||
    steps.some((s) => s?.action_type === 'human_approval');

  // Complexity: weighted so branching and AI count for more than raw step count.
  const complexityScore = steps.length + systemCount + branchingCount * 2 + aiStepCount * 2;
  const complexity = complexityScore >= 16 ? 'high' : complexityScore >= 8 ? 'medium' : 'low';

  const hostingPreference =
    constraints.self_hosting_required === true ? 'self_hosted' :
    constraints.self_hosting_required === false ? 'managed' : 'none';

  const securitySensitive =
    (constraints.security_requirements?.length ?? 0) > 0 ||
    (constraints.compliance_requirements?.length ?? 0) > 0;

  return {
    step_count: steps.length,
    system_count: systemCount,
    branching_count: branchingCount,
    has_complex_branching: branchingCount >= 3,
    ai_step_count: aiStepCount,
    ai_required: aiStepCount > 0,
    human_approval: humanApproval,
    monthly_runs: runs,
    volume_tier: volumeTier,
    volume_assumed: vol.assumed,
    complexity,
    complexity_score: complexityScore,
    hosting_preference: hostingPreference,
    technical_skill: normalizeSkill(constraints.technical_skill),
    cost_sensitive: !!constraints.budget,
    security_sensitive: securitySensitive,
    required_platforms: [...tokenSet(ic.required_platforms)],
    prohibited_platforms: [...tokenSet(ic.prohibited_platforms)],
    existing_platforms: [...tokenSet(ic.existing_platforms)],
    // How many Blueprint gaps would undercut a confident recommendation.
    blocking_unknowns: (bp.unknown_requirements || []).filter((u) => u?.blocks_generation).length,
  };
}

export default { extractSignals, normalizeSkill };
