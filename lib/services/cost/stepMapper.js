/**
 * Cost Intelligence — Phase 3: step-to-cost-unit mapper.
 *
 * Turns a Blueprint's process steps into platform-metered units, correctly and
 * per-platform, because the same workflow bills very differently:
 *
 *   n8n    → executions = monthly_events × workflow_runs_per_event
 *            (node count is complexity, NOT platform cost)
 *   Zapier → tasks = monthly_runs × Σ(successful_action × branch_probability)
 *            (triggers, filters and paths are FREE)
 *   Make   → operations = monthly_runs × Σ(module_weight × branch × bundle)
 *            (normal module = 1; router/filter ≈ 0; AI/file = variable)
 *   MCP    → not metered per run — cost is hosting + underlying API + LLM +
 *            connector maintenance (never a fabricated MCP "seat" price)
 *
 * It also derives the external-call breakdown (5,000 leads → 5,000 CRM writes,
 * 5,000 Slack notifications, …) that the Phase 1 external-tool lines quantify.
 *
 * Pure functions; the profile below is the single place step semantics live.
 */
import { getBillingModel } from './platformBillingModels.js';

/**
 * Per-Blueprint-action_type cost profile. Weights are per-platform because a
 * trigger is free on Zapier but still an operation on Make.
 *  - zapier_billable: does it consume a Zapier task? (only successful actions)
 *  - make_weight: operations/credits a Make module of this kind consumes
 *  - external_call: does it call an external system (→ API/tool usage)?
 *  - is_ai: does it invoke an LLM (→ token cost + variable Make weight)?
 *  - variable: weight is genuinely uncertain → lower confidence, honest note
 */
export const STEP_COST_PROFILE = {
  receive_data:     { kind: 'trigger',   zapier_billable: false, make_weight: 1, external_call: true,  is_ai: false },
  validate_data:    { kind: 'filter',    zapier_billable: false, make_weight: 0, external_call: false, is_ai: false },
  business_decision:{ kind: 'router',    zapier_billable: false, make_weight: 0, external_call: false, is_ai: false },
  transform_data:   { kind: 'transform', zapier_billable: true,  make_weight: 1, external_call: false, is_ai: false },
  retrieve_data:    { kind: 'action',    zapier_billable: true,  make_weight: 1, external_call: true,  is_ai: false },
  write_data:       { kind: 'action',    zapier_billable: true,  make_weight: 1, external_call: true,  is_ai: false },
  ai_reasoning:     { kind: 'ai',        zapier_billable: true,  make_weight: 3, external_call: true,  is_ai: true,  variable: true },
  generate_content: { kind: 'ai',        zapier_billable: true,  make_weight: 3, external_call: true,  is_ai: true,  variable: true },
  notification:     { kind: 'action',    zapier_billable: true,  make_weight: 1, external_call: true,  is_ai: false },
  human_approval:   { kind: 'human',     zapier_billable: false, make_weight: 0, external_call: false, is_ai: false },
  wait:             { kind: 'wait',      zapier_billable: false, make_weight: 0, external_call: false, is_ai: false },
  aggregate:        { kind: 'action',    zapier_billable: true,  make_weight: 1, external_call: false, is_ai: false },
  other:            { kind: 'unknown',   zapier_billable: true,  make_weight: 1, external_call: false, is_ai: false, variable: true },
};

const DEFAULT_PROFILE = STEP_COST_PROFILE.other;
const profileFor = (actionType) => STEP_COST_PROFILE[actionType] || DEFAULT_PROFILE;

/**
 * Map a Blueprint's steps into cost units for one platform.
 *
 * @param {object} args
 * @param {object} args.blueprint
 * @param {string} args.platform          n8n | make | zapier | claude(mcp)
 * @param {number} args.monthlyRuns       monthly business events (from volume)
 * @param {number} [args.runsPerEvent=1]  n8n: workflow runs per business event
 * @param {number} [args.bundleMultiplier=1] Make: bundles returned per module
 * @param {Object<string,number>} [args.branchProbabilities]  step_id → 0..1
 * @returns {{
 *   platform, primary_unit, metered, monthly_runs,
 *   units_per_run, monthly_units,
 *   per_step: Array, external_calls: Array,
 *   ai_step_count: number, confidence: string, assumptions: string[]
 * }}
 */
export function mapStepsToCostUnits({
  blueprint, platform, monthlyRuns,
  runsPerEvent = 1, bundleMultiplier = 1, branchProbabilities = {},
}) {
  const model = getBillingModel(platform);
  const steps = Array.isArray(blueprint?.process_steps) ? blueprint.process_steps : [];
  const basis = model?.execution_quantity_basis || 'none';
  const assumptions = [];

  const branchOf = (s) => {
    const p = branchProbabilities[s?.step_id];
    return Number.isFinite(p) ? Math.min(1, Math.max(0, p)) : 1; // default: always runs
  };

  // Per-step contribution to the platform's metered unit + external-call flag.
  let hasFilter = false;
  let hasVariable = false;
  const perStep = steps.map((s) => {
    const prof = profileFor(s?.action_type);
    const branch = branchOf(s);
    if (prof.kind === 'filter' || prof.kind === 'router') hasFilter = true;
    if (prof.variable) hasVariable = true;

    let unit = 0;
    if (basis === 'per_billable_action') unit = prof.zapier_billable ? branch : 0;
    else if (basis === 'per_module') unit = prof.make_weight * branch * bundleMultiplier;
    // per_execution / none don't accumulate per-step (see units_per_run below).

    return {
      step_id: s?.step_id, action: s?.action, action_type: s?.action_type,
      kind: prof.kind, billable: basis === 'per_billable_action' ? prof.zapier_billable : prof.make_weight > 0,
      weight: basis === 'per_module' ? prof.make_weight : (prof.zapier_billable ? 1 : 0),
      branch_probability: branch,
      external_call: prof.external_call,
      is_ai: prof.is_ai,
      unit_contribution_per_run: round(unit),
    };
  });

  // Units PER RUN, by billing basis.
  let unitsPerRun;
  if (basis === 'per_execution') {
    unitsPerRun = runsPerEvent;                    // n8n: node count irrelevant
    if (runsPerEvent !== 1) assumptions.push(`Assumed ${runsPerEvent} workflow run(s) per business event.`);
  } else if (basis === 'none') {
    unitsPerRun = 0;                               // MCP / Claude Code: not metered per run
  } else {
    unitsPerRun = perStep.reduce((sum, s) => sum + s.unit_contribution_per_run, 0);
    // A workflow with steps should never meter as 0 units on a metered platform
    // unless it genuinely has no billable actions; guard the empty case only.
    if (unitsPerRun === 0 && steps.length === 0) {
      unitsPerRun = 1;
      assumptions.push('No steps captured yet — assumed 1 billable unit per run (low confidence).');
    }
  }
  unitsPerRun = round(unitsPerRun);

  // External calls: each external-touching step makes ~1 call/run (× branch),
  // grouped so 5,000 runs → "5,000 CRM writes / 5,000 Slack notifications".
  const externalSteps = perStep.filter((s) => s.external_call);
  const external_calls = externalSteps.map((s) => ({
    step_id: s.step_id,
    label: s.action || s.action_type,
    calls_per_run: s.branch_probability,
    monthly_calls: Math.round(monthlyRuns * s.branch_probability),
  }));

  const ai_step_count = perStep.filter((s) => s.is_ai).length;

  // Confidence: filters/routers (unknown branch rates) and variable modules
  // (AI/file) both make the metered estimate softer.
  let confidence = 'medium';
  if (hasVariable) { confidence = 'low'; assumptions.push('AI/variable modules have non-fixed unit cost — treated as an estimate (low confidence).'); }
  if (hasFilter) { confidence = 'low'; assumptions.push('Filters/routers present — actual runs depend on branch rates (assumed 100%). Provide branch probabilities to refine.'); }

  return {
    platform,
    primary_unit: model?.primary_unit || 'unknown',
    metered: !!model?.metered,
    monthly_runs: monthlyRuns,
    units_per_run: unitsPerRun,
    monthly_units: Math.round(monthlyRuns * unitsPerRun),
    per_step: perStep,
    external_calls,
    ai_step_count,
    confidence,
    assumptions,
  };
}

function round(n) { return Math.round((Number(n) || 0) * 1000) / 1000; }

export default { STEP_COST_PROFILE, mapStepsToCostUnits };
