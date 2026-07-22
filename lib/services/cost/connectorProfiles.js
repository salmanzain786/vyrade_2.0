/**
 * Cost Intelligence — Phase 5: connector/tool pricing profiles (pure logic).
 *
 * Governance + math for `connector_cost_profiles` (DB access lives in
 * connectorProfileRepository.js). Same honesty contract as the rest of the
 * engine:
 *   - unknown price → { unit_price: null, confidence: 'unknown' }, never a guess
 *   - a 'high' confidence claim needs a pricing_url behind it (echoes Phase 4)
 *   - a genuinely no-added-cost tool (e.g. Slack's API on an existing plan)
 *     resolves to a real $0, distinct from "we don't know".
 */

/** Allowed pricing models (extensible; 'unknown' is always valid). */
export const PRICING_MODELS = {
  PER_API_CALL: 'per_api_call',
  WORKSPACE_PLAN: 'workspace_plan',
  SUBSCRIPTION: 'subscription',
  PER_SEAT: 'per_seat',
  TIERED: 'tiered',
  USAGE_BASED: 'usage_based',
  FREE: 'free',
  UNKNOWN: 'unknown',
};
export const PRICING_MODEL_VALUES = new Set(Object.values(PRICING_MODELS));

// DECIMAL columns come back from mysql2 as strings; normalise carefully.
const asNum = (v) => (v == null || v === '' ? null : Number(v));
const asInt = (v) => (v == null || v === '' ? null : parseInt(v, 10));
const asBool = (v) => (v == null ? null : !!Number(v));
const round = (n) => Math.round((Number(n) || 0) * 1e6) / 1e6;

const camel = (p, snake, camelKey) => p[snake] ?? p[camelKey];

/** A tool whose API adds no per-use cost on an existing/free plan. */
function isNoAddedCostModel(model, requiresPaid) {
  return model === PRICING_MODELS.FREE
      || (model === PRICING_MODELS.WORKSPACE_PLAN && requiresPaid === false);
}

/**
 * Governed confidence for a profile: never claim more than the data supports.
 * No price and not a known-zero case → 'unknown'. A 'high' claim without a
 * pricing_url is demoted to 'medium'.
 */
export function governConfidence(profile) {
  const claimed = profile?.confidence || 'unknown';
  const hasPrice = asNum(camel(profile, 'unit_price', 'unitPrice')) != null
                || asNum(camel(profile, 'overage_price', 'overagePrice')) != null;
  const model = camel(profile, 'pricing_model', 'pricingModel');
  const requiresPaid = asBool(camel(profile, 'requires_paid_plan', 'requiresPaidPlan'));

  if (!hasPrice && !isNoAddedCostModel(model, requiresPaid)) return 'unknown';
  const url = camel(profile, 'pricing_url', 'pricingUrl');
  if (claimed === 'high' && !url) return 'medium';
  return claimed;
}

/** The honest "no profile" result. */
export function noProfileResult(systemName = null) {
  return {
    found: false,
    unit_price: null,
    confidence: 'unknown',
    reason: `No pricing profile found for connector${systemName ? ` '${systemName}'` : ''}.`,
  };
}

/** Normalise a DB row (or null) into a governed, typed profile summary. */
export function resolveConnectorProfile(profile, { systemName = null } = {}) {
  if (!profile) return noProfileResult(systemName);
  return {
    found: true,
    connector_name: camel(profile, 'connector_name', 'connectorName'),
    system_name: camel(profile, 'system_name', 'systemName'),
    platform: profile.platform ?? null,
    pricing_model: camel(profile, 'pricing_model', 'pricingModel') || 'unknown',
    unit_name: camel(profile, 'unit_name', 'unitName'),
    unit_price: asNum(camel(profile, 'unit_price', 'unitPrice')),
    included_units: asInt(camel(profile, 'included_units', 'includedUnits')),
    overage_price: asNum(camel(profile, 'overage_price', 'overagePrice')),
    free_tier_available: asBool(camel(profile, 'free_tier_available', 'freeTierAvailable')),
    requires_paid_plan: asBool(camel(profile, 'requires_paid_plan', 'requiresPaidPlan')),
    pricing_url: camel(profile, 'pricing_url', 'pricingUrl') ?? null,
    rate_limit_notes: camel(profile, 'rate_limit_notes', 'rateLimitNotes') ?? null,
    notes: profile.notes ?? null,
    confidence: governConfidence(profile),
    last_checked_at: camel(profile, 'last_checked_at', 'lastCheckedAt') ?? null,
  };
}

/**
 * Estimate the monthly cost this connector adds, for a given call/usage volume.
 * Returns { cost:null, confidence:'unknown' } when the price isn't known — the
 * external-tool line then stays honest rather than inventing a figure.
 *
 * @param {object|null} profile      a connector_cost_profiles row (or resolved)
 * @param {object} opts
 * @param {number} opts.monthlyUnits usage units for the month (e.g. API calls)
 */
export function estimateConnectorMonthlyCost(profile, { monthlyUnits = 0 } = {}) {
  if (!profile) return { cost: null, confidence: 'unknown', reason: 'No pricing profile.' };

  const model = camel(profile, 'pricing_model', 'pricingModel');
  const requiresPaid = asBool(camel(profile, 'requires_paid_plan', 'requiresPaidPlan'));
  const unitPrice = asNum(camel(profile, 'unit_price', 'unitPrice'));
  const overage = asNum(camel(profile, 'overage_price', 'overagePrice'));
  const included = asInt(camel(profile, 'included_units', 'includedUnits')) || 0;
  const freeTier = asBool(camel(profile, 'free_tier_available', 'freeTierAvailable'));
  const conf = governConfidence(profile);

  // No per-use price on record.
  if (unitPrice == null && overage == null) {
    if (isNoAddedCostModel(model, requiresPaid)) {
      // A real $0 — the API adds nothing on the existing/free plan.
      return {
        cost: 0,
        confidence: conf === 'unknown' ? (profile.confidence || 'medium') : conf,
        breakdown: { model, added_cost: 0 },
        note: 'API adds no per-use cost on the current plan; plan/rate limits may still apply.',
      };
    }
    return { cost: null, confidence: 'unknown', reason: 'No unit price recorded for this connector yet.' };
  }

  // Usage-based: bill only beyond any included allowance.
  const perUnit = overage ?? unitPrice;
  const withinFreeTier = freeTier && monthlyUnits <= included;
  const billableUnits = withinFreeTier ? 0 : Math.max(0, monthlyUnits - included);
  return {
    cost: round(billableUnits * perUnit),
    confidence: conf,
    breakdown: { monthly_units: monthlyUnits, included_units: included, billable_units: billableUnits, per_unit: perUnit },
  };
}

export default {
  PRICING_MODELS, PRICING_MODEL_VALUES, governConfidence,
  noProfileResult, resolveConnectorProfile, estimateConnectorMonthlyCost,
};
