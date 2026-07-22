/**
 * Cost Intelligence — Phase 2: platform billing models.
 *
 * Reference data describing HOW each orchestration platform meters usage —
 * execution vs. task vs. credit vs. underlying-service — independent of any
 * dollar amount. This is the layer that turns "the workflow has 4 steps" into
 * "…which is ~4 Zapier tasks / ~4 Make operations / 1 n8n execution per run".
 *
 * Why a code module and not a DB table: a billing *model* is structural and
 * near-static (it changes when a vendor overhauls how they bill — rarely). The
 * volatile part — plan tiers and dollar prices — is what belongs in a table
 * with `last_checked` + admin overrides (a later sub-phase). Keeping this as
 * pure data matches lib/exporters/registry.js and lets the UI import it too.
 *
 * The cost engine (costModel.js) reads `execution_quantity_basis` +
 * `default_module_weight` to derive the metered-usage line, so adding/adjusting
 * a platform's metering is a data edit here, not a code change there.
 */

// billing_model  — the vendor's headline metering concept
// primary_unit   — the unit a user is billed in
// node_level_pricing — does cost scale per node/module, or per whole run?
// metered        — is there any per-run usage metering at all?
// execution_quantity_basis — how the engine computes units PER RUN:
//    'per_execution'       → 1 (whole-run billing; node count irrelevant)
//    'per_billable_action' → count of steps that hit an external system
//    'per_module'          → count of modules (× default_module_weight)
//    'none'                → not metered per run (cost is elsewhere)
// free_step_types / billable_step_types — the vendor's own vocabulary, kept for
//    transparency and UI copy (NOT the Blueprint's action_type enum).
export const PLATFORM_BILLING_MODELS = {
  n8n: {
    platform: 'n8n',
    billing_model: 'workflow_execution',
    primary_unit: 'execution',
    node_level_pricing: false,
    metered: true,
    execution_quantity_basis: 'per_execution',
    default_module_weight: 1,
    self_hostable: true,
    free_step_types: ['trigger'],
    billable_step_types: ['execution'],
    notes: 'n8n cost is based on workflow executions, not per-node operations. Self-hosted executions are unmetered — you pay for hosting instead.',
  },
  make: {
    platform: 'make',
    billing_model: 'credits',
    // Make's real metered unit is the "operation"; "credit" in the task spec is
    // the same idea. We use 'operation' to stay consistent with the engine's
    // BILLING_UNIT and Make's own dashboards. See `also_known_as`.
    primary_unit: 'operation',
    also_known_as: 'credit',
    node_level_pricing: false,
    metered: true,
    execution_quantity_basis: 'per_module',
    default_module_weight: 1,
    self_hostable: false,
    free_step_types: [],
    billable_step_types: ['module'],
    notes: 'Most normal module actions can be estimated as 1 operation, but AI/document/file modules may consume more. High volume raises the required plan tier.',
  },
  zapier: {
    platform: 'zapier',
    billing_model: 'tasks',
    primary_unit: 'task',
    node_level_pricing: false,
    metered: true,
    execution_quantity_basis: 'per_billable_action',
    default_module_weight: 1,
    self_hostable: false,
    free_step_types: ['trigger', 'filter', 'path'],
    billable_step_types: ['successful_action'],
    notes: 'Zapier task usage is based on successful action steps; triggers, filters and paths are free.',
  },
  // 'claude' is our platform key for the Claude Code export; its billing model
  // is the MCP/underlying-service layer from the task spec (aliased below).
  claude: {
    platform: 'claude',
    also_known_as: 'mcp',
    billing_model: 'underlying_service',
    primary_unit: 'unknown',
    node_level_pricing: false,
    metered: false,
    execution_quantity_basis: 'none',
    default_module_weight: 1,
    self_hostable: true,
    free_step_types: [],
    billable_step_types: [],
    notes: 'MCP is a connector/protocol layer. Cost comes from hosting, underlying APIs, LLM usage, or commercial provider pricing — not from a per-run platform fee.',
  },
};

// Accept the spec's alternate names (e.g. 'mcp' → 'claude') so callers can use
// either vocabulary.
const ALIASES = { mcp: 'claude' };

/** Resolve a platform (or alias) to its billing model, or null if unknown. */
export function getBillingModel(platform) {
  if (!platform) return null;
  const key = ALIASES[platform] || platform;
  return PLATFORM_BILLING_MODELS[key] || null;
}

/** How many billable units this platform charges PER RUN for a given Blueprint.
 *  Pure function of the model + already-computed step counts. */
export function unitsPerRun(model, { billableActionSteps, moduleCount }) {
  if (!model || !model.metered) return 0;
  switch (model.execution_quantity_basis) {
    case 'per_execution': return 1;
    case 'per_billable_action': return Math.max(1, billableActionSteps);
    case 'per_module': return Math.max(1, moduleCount) * (model.default_module_weight || 1);
    default: return 0;
  }
}

export default { PLATFORM_BILLING_MODELS, getBillingModel, unitsPerRun };
