/**
 * Cost Intelligence — Phase 1: the taxonomy.
 *
 * This module is deliberately about STRUCTURE, not prices. It defines the nine
 * cost categories every automation can incur, the canonical shape of a single
 * cost line item, and a factory that normalises + validates that shape.
 *
 * Real unit prices (scraping, pricing tables, admin overrides) are Phase 2. In
 * Phase 1 every `unit_price` is null — we describe WHAT a user will be billed
 * for and the FORMULA for how much, never a fabricated number. This is the
 * single most important rule of the whole engine:
 *
 *     Never present a guess as an exact cost. Missing price → unit_price:null,
 *     confidence:'unknown', and an honest note. Do not hallucinate.
 *
 * Pure data + pure functions only (no DB, no network) so the UI can import it.
 */

// ── The nine cost categories ──────────────────────────────────────────────
// Keys are stable identifiers (safe for DB columns / API payloads); labels are
// for humans. Order is the order we present a breakdown in.
export const COST_CATEGORIES = {
  ORCHESTRATION_PLATFORM: {
    key: 'orchestration_platform',
    label: 'Orchestration platform cost',
    description: 'The automation platform itself (n8n / Make / Zapier plan, or Claude Code).',
  },
  EXECUTION_TASK_CREDIT: {
    key: 'execution_task_credit',
    label: 'Execution / task / credit cost',
    description: 'Metered usage the platform bills per run: Zapier tasks, Make operations, n8n executions.',
  },
  EXTERNAL_API_TOOL: {
    key: 'external_api_tool',
    label: 'External API / tool cost',
    description: 'Third-party SaaS subscriptions and API usage for the systems in the workflow.',
  },
  LLM_TOKEN: {
    key: 'llm_token',
    label: 'LLM token cost',
    description: 'Model token spend for AI reasoning / content-generation steps.',
  },
  MCP_CONNECTOR: {
    key: 'mcp_connector',
    label: 'MCP connector cost',
    description: 'Model Context Protocol connectors (Claude Code export). Usually free; underlying APIs still bill.',
  },
  HOSTING_INFRASTRUCTURE: {
    key: 'hosting_infrastructure',
    label: 'Hosting / infrastructure cost',
    description: 'Compute to run the automation — a VPS/container for self-hosted n8n, etc.',
  },
  STORAGE_LOGGING: {
    key: 'storage_logging',
    label: 'Storage / logging cost',
    description: 'Execution logs, data retention, and storage that can grow with volume.',
  },
  HUMAN_MANUAL_OPS: {
    key: 'human_manual_ops',
    label: 'Human approval / manual operations cost',
    description: 'Human time for approvals or manual steps the automation still requires.',
  },
  UNKNOWN: {
    key: 'unknown',
    label: 'Unknown cost drivers',
    description: 'Costs we cannot yet quantify — plan overages, reruns, maintenance, missing pricing.',
  },
};

/** Set of valid category keys, for validation. */
export const CATEGORY_KEYS = new Set(Object.values(COST_CATEGORIES).map((c) => c.key));

// ── Controlled vocabularies ───────────────────────────────────────────────

/** How a component is metered. `unknown` is always allowed. */
export const BILLING_UNIT = {
  MONTH: 'month',
  TASK: 'task',            // Zapier
  OPERATION: 'operation',  // Make
  EXECUTION: 'execution',  // n8n
  RUN: 'run',
  TOKEN: 'token',
  API_CALL: 'api_call',
  CONNECTOR: 'connector',
  GB_MONTH: 'gb_month',
  HOUR: 'hour',
  UNKNOWN: 'unknown',
};

/**
 * Confidence in a cost line. Phase 1 mostly emits 'low'/'unknown' because no
 * prices are resolved yet; the FORMULA can still be high-confidence even when
 * the price is unknown, so confidence is about the estimate as a whole.
 */
export const CONFIDENCE = { HIGH: 'high', MEDIUM: 'medium', LOW: 'low', UNKNOWN: 'unknown' };
const CONFIDENCE_VALUES = new Set(Object.values(CONFIDENCE));
// Ranked worst→best so we can take the floor across many items.
const CONFIDENCE_RANK = { unknown: 0, low: 1, medium: 2, high: 3 };

/** Where a (future) price came from — provenance is mandatory in the DoD. */
export const PRICE_SOURCE = {
  OFFICIAL_PRICING_PAGE: 'official_pricing_page',
  VENDOR_ESTIMATE: 'vendor_estimate',
  COMMUNITY_REPORTED: 'community_reported',
  ADMIN_OVERRIDE: 'admin_override',
  UNKNOWN: 'unknown',
};

/**
 * Build a normalised cost line item. This is the ONLY sanctioned way to create
 * one, so every item across the engine has the same fields and passes the same
 * guards.
 *
 * @returns {{
 *   component: string, category: string, cost_type: string,
 *   billing_unit: string, quantity_formula: string|null,
 *   quantity_estimate: number|null, unit_price: number|null,
 *   currency: string, price_source: string, confidence: string, notes: string
 * }}
 */
export function makeCostItem({
  component,
  category,
  cost_type,
  billing_unit = BILLING_UNIT.UNKNOWN,
  quantity_formula = null,
  quantity_estimate = null,
  unit_price = null,        // Phase 1: ALWAYS null. Enforced below.
  currency = 'USD',
  price_source = PRICE_SOURCE.UNKNOWN,
  confidence = CONFIDENCE.UNKNOWN,
  notes = '',
}) {
  if (!component || typeof component !== 'string') {
    throw new Error('[cost] cost item requires a non-empty `component`');
  }
  if (!CATEGORY_KEYS.has(category)) {
    throw new Error(`[cost] unknown category '${category}' for component '${component}'`);
  }
  if (!CONFIDENCE_VALUES.has(confidence)) {
    throw new Error(`[cost] invalid confidence '${confidence}' for component '${component}'`);
  }
  // Guard against a stray price sneaking in during Phase 1. If a real number is
  // ever provided (Phase 2), it must be non-negative.
  if (unit_price !== null) {
    if (typeof unit_price !== 'number' || Number.isNaN(unit_price) || unit_price < 0) {
      throw new Error(`[cost] unit_price must be null or a non-negative number (component '${component}')`);
    }
  }
  return {
    component,
    category,
    cost_type: cost_type || 'unknown',
    billing_unit,
    quantity_formula,
    quantity_estimate: Number.isFinite(quantity_estimate) ? quantity_estimate : null,
    unit_price,
    currency,
    price_source,
    confidence,
    notes: notes || '',
  };
}

/** The lowest confidence across a set of items (an overall estimate is only as
 *  strong as its weakest line). Empty set → 'unknown'. */
export function floorConfidence(items) {
  if (!items?.length) return CONFIDENCE.UNKNOWN;
  let rank = CONFIDENCE_RANK.high;
  for (const it of items) {
    const r = CONFIDENCE_RANK[it.confidence] ?? 0;
    if (r < rank) rank = r;
  }
  return Object.keys(CONFIDENCE_RANK).find((k) => CONFIDENCE_RANK[k] === rank) || CONFIDENCE.UNKNOWN;
}

export default { COST_CATEGORIES, CATEGORY_KEYS, BILLING_UNIT, CONFIDENCE, PRICE_SOURCE, makeCostItem, floorConfidence };
