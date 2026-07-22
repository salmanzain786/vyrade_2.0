/**
 * Cost Intelligence — Phase 1: derive the cost MODEL from a Blueprint.
 *
 * Given a neutral Automation Blueprint and a target platform, produce the full
 * list of cost line items it will incur — one per relevant category — with
 * transparent quantity formulas, best-effort quantity estimates, honest
 * confidence, and assumptions. Crucially: NO prices (Phase 1). Every
 * `unit_price` is null; dollar totals arrive in Phase 2 with real pricing data.
 *
 * The whole point is transparency: the user sees WHAT they'll be billed for and
 * HOW the amount scales, long before we can tell them the exact dollars — and
 * we never fabricate a number to fill the gap.
 */
import {
  COST_CATEGORIES as CAT, BILLING_UNIT as U, CONFIDENCE as C, PRICE_SOURCE as SRC,
  makeCostItem, floorConfidence,
} from './taxonomy.js';
import { normalizeMonthlyRuns } from './volume.js';
import { getBillingModel } from './platformBillingModels.js';
import { mapStepsToCostUnits } from './stepMapper.js';
import { isKnownPlatform, EXPORT_PLATFORMS } from '../../exporters/registry.js';

// Rough token budget per AI step (input+output). A stated assumption, not a
// measurement — surfaced in notes so it's never mistaken for a fact.
const ASSUMED_TOKENS_PER_AI_STEP = 4000;

const steps = (bp) => (Array.isArray(bp?.process_steps) ? bp.process_steps : []);
const systems = (bp) => (Array.isArray(bp?.systems) ? bp.systems : []);

/** Unique external systems (tools/APIs) referenced by the blueprint. */
function externalTools(bp) {
  const names = new Map();
  for (const s of systems(bp)) if (s?.name) names.set(s.name.toLowerCase(), s);
  const src = bp?.trigger?.source_system;
  if (src && !names.has(src.toLowerCase())) {
    names.set(src.toLowerCase(), { name: src, role: 'trigger_source', required: true });
  }
  return [...names.values()];
}

function needsHumanOps(bp) {
  return (
    bp?.human_approval?.required === true ||
    (bp?.human_approval?.approval_points?.length ?? 0) > 0 ||
    steps(bp).some((s) => s?.action_type === 'human_approval')
  );
}

// Map a billing model's `primary_unit` to our BILLING_UNIT vocabulary + a
// human formula. Data-driven so a new platform is a billingModels.js edit only.
const UNIT_MAP = {
  execution: { unit: U.EXECUTION, formula: 'monthly_runs (1 execution per run)' },
  task:      { unit: U.TASK,      formula: 'monthly_runs * billable_action_steps' },
  operation: { unit: U.OPERATION, formula: 'monthly_runs * modules_per_run' },
};

// ── Execution/task/credit metering, from the Phase 3 step→unit mapper ───────
// `metering` is the mapStepsToCostUnits() result — it already knows units/run
// (per-step weights, trigger-free Zapier, module weights) and its confidence.
function meteredExecutionItem(platform, metering) {
  const model = getBillingModel(platform);
  if (!model || !metering.metered) return null; // e.g. Claude Code (underlying_service)

  const mapped = UNIT_MAP[model.primary_unit] || { unit: U.RUN, formula: 'monthly_runs * units_per_run' };
  return makeCostItem({
    component: EXPORT_PLATFORMS[platform]?.name || model.platform,
    category: CAT.EXECUTION_TASK_CREDIT.key,
    cost_type: `platform_${model.primary_unit}_usage`,
    billing_unit: mapped.unit,
    quantity_formula: mapped.formula,
    quantity_estimate: metering.monthly_units,
    price_source: SRC.OFFICIAL_PRICING_PAGE, confidence: metering.confidence,
    notes: `${model.notes} (~${metering.units_per_run} ${model.primary_unit}(s)/run from ${metering.per_step.length} step(s).) Exact price depends on the selected plan tier.`,
  });
}

// ── Orchestration platform subscription ────────────────────────────────────
const PLATFORM_SUBSCRIPTION_NOTE = {
  zapier: 'A paid Zapier plan is needed for multi-step Zaps and once you exceed the free task allowance.',
  make: 'Make has a free tier; a paid plan is needed for higher operation volume and advanced modules.',
  n8n: 'n8n is open-source and free to self-host (you pay for hosting). n8n Cloud is a paid subscription instead.',
  claude: 'Claude Code runs against your Anthropic API key or Claude plan; there is no separate orchestration fee.',
};

function platformSubscriptionItem(platform) {
  const name = EXPORT_PLATFORMS[platform]?.name || platform;
  return makeCostItem({
    component: name, category: CAT.ORCHESTRATION_PLATFORM.key,
    cost_type: 'platform_subscription', billing_unit: U.MONTH,
    quantity_formula: '1 (monthly subscription)', quantity_estimate: 1,
    price_source: SRC.OFFICIAL_PRICING_PAGE,
    confidence: platform === 'n8n' ? C.LOW : C.MEDIUM,
    notes: PLATFORM_SUBSCRIPTION_NOTE[platform] || 'Platform subscription cost depends on the selected plan.',
  });
}

/**
 * Derive the full cost model.
 *
 * @param {object}  args
 * @param {object}  args.blueprint      Automation Blueprint content
 * @param {string}  args.platform       'n8n' | 'make' | 'zapier' | 'claude'
 * @param {number}  [args.monthlyRuns]  explicit monthly volume from the user (optional)
 * @param {number}  [args.runsPerEvent] n8n: workflow runs per business event (default 1)
 * @param {number}  [args.bundleMultiplier] Make: bundles returned per module (default 1)
 * @param {string}  [args.blueprintId]  passthrough for callers
 * @returns {object} cost model (see shape at the bottom)
 */
export function deriveCostModel({
  blueprint, platform, monthlyRuns = null,
  runsPerEvent = 1, bundleMultiplier = 1, blueprintId = null,
}) {
  if (!blueprint || typeof blueprint !== 'object') throw new Error('[cost] blueprint is required');
  if (!isKnownPlatform(platform)) throw new Error(`[cost] unknown platform '${platform}'`);

  const bp = blueprint;
  const vol = normalizeMonthlyRuns(bp.volume, monthlyRuns);
  const runs = vol.monthly_runs;
  const items = [];
  const assumptions = [];

  // Phase 3: map steps → platform cost units once, then reuse everywhere.
  const metering = mapStepsToCostUnits({ blueprint: bp, platform, monthlyRuns: runs, runsPerEvent, bundleMultiplier });

  // 1) Orchestration platform subscription.
  items.push(platformSubscriptionItem(platform));

  // 2) Execution / task / credit metering (not applicable to Claude Code).
  const metered = meteredExecutionItem(platform, metering);
  if (metered) items.push(metered);

  // 3) External API / tool cost — one line per referenced system. The Phase 3
  // mapper gives us the monthly external-call volume (5,000 runs → ~5,000 calls
  // per external step); we attribute ~1 call/run to each tool by default.
  const monthlyExternalCalls = metering.external_calls.reduce((s, c) => s + c.monthly_calls, 0);
  for (const tool of externalTools(bp)) {
    items.push(makeCostItem({
      component: tool.name, category: CAT.EXTERNAL_API_TOOL.key,
      cost_type: 'tool_subscription_or_api', billing_unit: U.API_CALL,
      quantity_formula: 'plan_subscription + (monthly_runs * calls_per_run)',
      quantity_estimate: runs, // ~one call per run per tool (default)
      price_source: SRC.UNKNOWN, confidence: C.LOW,
      notes: `~${runs.toLocaleString()} API calls/month for ${tool.name}. May already be owned (then $0 to this automation); pricing depends on your plan. Not hallucinated — resolved in a later phase.`,
    }));
  }
  if (externalTools(bp).length) {
    assumptions.push(`Third-party tools may already be owned; those are not an added cost of the automation. (~${monthlyExternalCalls.toLocaleString()} external calls/month across all steps.)`);
  }

  // 4) LLM token cost — only when the workflow actually reasons/generates.
  const aiSteps = metering.ai_step_count;
  if (aiSteps > 0 || platform === 'claude') {
    const perRun = Math.max(aiSteps, platform === 'claude' ? 1 : 0);
    items.push(makeCostItem({
      component: 'LLM tokens', category: CAT.LLM_TOKEN.key,
      cost_type: 'llm_tokens', billing_unit: U.TOKEN,
      quantity_formula: 'monthly_runs * ai_steps_per_run * avg_tokens_per_step',
      quantity_estimate: runs * perRun * ASSUMED_TOKENS_PER_AI_STEP,
      price_source: SRC.OFFICIAL_PRICING_PAGE, confidence: C.LOW,
      notes: `${perRun} AI step(s)/run × ~${ASSUMED_TOKENS_PER_AI_STEP.toLocaleString()} tokens (assumed). Actual cost depends on the chosen model and real prompt sizes.`,
    }));
  }

  // 5) MCP connector cost — Claude Code export only.
  if (platform === 'claude') {
    for (const tool of externalTools(bp)) {
      items.push(makeCostItem({
        component: `${tool.name} MCP connector`, category: CAT.MCP_CONNECTOR.key,
        cost_type: 'mcp_connector', billing_unit: U.CONNECTOR,
        quantity_formula: '1 connector per external system',
        quantity_estimate: 1, price_source: SRC.COMMUNITY_REPORTED, confidence: C.LOW,
        notes: 'Most MCP connectors are free/open-source; the underlying API (see external tool cost) is what bills.',
      }));
    }
  }

  // 6) Hosting / infrastructure.
  const selfHostedN8n = platform === 'n8n' && bp?.constraints?.self_hosting_required !== false;
  if (selfHostedN8n) {
    items.push(makeCostItem({
      component: 'Self-hosting (VPS/container)', category: CAT.HOSTING_INFRASTRUCTURE.key,
      cost_type: 'hosting', billing_unit: U.MONTH,
      quantity_formula: '1 host (scales with concurrency/volume)', quantity_estimate: 1,
      price_source: SRC.VENDOR_ESTIMATE, confidence: C.LOW,
      notes: 'Self-hosted n8n needs a server (small VPS/container). Cost scales with volume and concurrency.',
    }));
    assumptions.push('n8n assumed self-hosted (no explicit self_hosting_required=false in the Blueprint).');
  } else {
    items.push(makeCostItem({
      component: `${EXPORT_PLATFORMS[platform]?.name || platform} (managed)`, category: CAT.HOSTING_INFRASTRUCTURE.key,
      cost_type: 'hosting_included', billing_unit: U.MONTH,
      quantity_formula: 'none — managed by the platform', quantity_estimate: 0,
      price_source: SRC.OFFICIAL_PRICING_PAGE, confidence: C.MEDIUM,
      notes: 'No separate hosting — the SaaS platform runs the automation for you (bundled in the subscription).',
    }));
  }

  // 7) Storage / logging.
  items.push(makeCostItem({
    component: 'Execution logs & storage', category: CAT.STORAGE_LOGGING.key,
    cost_type: 'storage_logging', billing_unit: U.GB_MONTH,
    quantity_formula: 'monthly_runs * avg_log_size (grows with retention)',
    price_source: SRC.UNKNOWN, confidence: C.LOW,
    notes: 'Execution history and data retention. Usually bundled, but high volume or long retention can add overage.',
  }));

  // 8) Human approval / manual operations.
  if (needsHumanOps(bp)) {
    items.push(makeCostItem({
      component: 'Human review time', category: CAT.HUMAN_MANUAL_OPS.key,
      cost_type: 'manual_operations', billing_unit: U.HOUR,
      quantity_formula: 'monthly_runs * approval_fraction * minutes_per_approval / 60',
      price_source: SRC.UNKNOWN, confidence: C.LOW,
      notes: 'A human still approves/handles part of this workflow. Not a platform charge, but a real recurring operational cost.',
    }));
    assumptions.push('Workflow requires human approval/manual steps — human time is a hidden but real cost.');
  }

  // 9) Unknown cost drivers — always present (honest catch-all), plus anything
  // the Blueprint itself flagged as blocking cost confidence.
  const flagged = (bp?.unknown_requirements || []).filter((u) => u?.blocks_cost_confidence);
  items.push(makeCostItem({
    component: 'Unmodeled drivers', category: CAT.UNKNOWN.key,
    cost_type: 'unknown', billing_unit: U.UNKNOWN,
    quantity_formula: null, price_source: SRC.UNKNOWN, confidence: C.UNKNOWN,
    notes: 'Plan overages, failed-run retries, and ongoing maintenance are not yet modeled. Prices are resolved in Phase 2.',
  }));
  for (const u of flagged) {
    assumptions.push(`Cost confidence limited: ${u.reason || u.field_path || 'unspecified unknown'}.`);
  }

  // Metering assumptions from the step mapper (branch probabilities, variable
  // AI modules, runs-per-event) — deduped so they don't repeat.
  for (const a of metering.assumptions) if (!assumptions.includes(a)) assumptions.push(a);

  // Volume + framing assumptions.
  assumptions.unshift(vol.basis);
  assumptions.push('This shows cost STRUCTURE and quantities only — dollar amounts are not yet resolved (no fabricated prices).');

  // Overall confidence: never stronger than the volume basis, the metering
  // basis, or the weakest MODELED line. The always-present "unknown drivers"
  // catch-all is a standing disclaimer, not a priced line, so it's excluded —
  // otherwise every estimate would collapse to 'unknown' and mean nothing.
  const modeled = items.filter((it) => it.category !== CAT.UNKNOWN.key);
  const overall = weakest(vol.confidence, weakest(metering.confidence, floorConfidence(modeled)));

  // Categories present, in canonical order.
  const order = Object.values(CAT).map((c) => c.key);
  const categories = order
    .map((key) => {
      const meta = Object.values(CAT).find((c) => c.key === key);
      const count = items.filter((it) => it.category === key).length;
      return count ? { key, label: meta.label, item_count: count } : null;
    })
    .filter(Boolean);

  return {
    blueprint_id: blueprintId,
    platform,
    platform_name: EXPORT_PLATFORMS[platform]?.name || platform,
    currency: 'USD',
    volume: vol,
    items,
    categories,
    // Phase 3: the step→unit mapping behind the metered line, for UI drill-down.
    metering: {
      primary_unit: metering.primary_unit,
      units_per_run: metering.units_per_run,
      monthly_units: metering.monthly_units,
      per_step: metering.per_step,
    },
    external_calls: metering.external_calls,
    estimated_total: null,               // no prices yet → no total (by design)
    total_note: 'Dollar totals arrive with the pricing-data phase.',
    confidence: overall,
    assumptions,
    phase: 3,
  };
}

const RANK = { unknown: 0, low: 1, medium: 2, high: 3 };
function weakest(a, b) {
  const lo = Math.min(RANK[a] ?? 0, RANK[b] ?? 0);
  return Object.keys(RANK).find((k) => RANK[k] === lo) || 'unknown';
}

export default { deriveCostModel };
