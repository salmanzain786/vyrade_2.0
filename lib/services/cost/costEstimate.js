/**
 * Cost Intelligence — Phase 6: the cost estimate output.
 *
 * This is where every layer meets. It takes the structural cost model
 * (deriveCostModel: taxonomy + billing model + step mapper) and applies real
 * prices — platform prices from the pricing_sources registry (Phase 4) and
 * per-tool prices from connector_cost_profiles (Phase 5) — to emit a single
 * structured estimate: cost_components, estimated_units, unknowns, confidence,
 * and (only when everything is priced) a dollar total.
 *
 * Honesty is preserved end to end: a component with no price keeps `price:
 * null`, the reason says why, and the gap is surfaced in `unknowns`. The overall
 * confidence never exceeds the weakest priced/quantified line.
 *
 * Price lookups are injectable (`resolvers`) so this composes with the DB in
 * production and runs fully pure in tests.
 */
import { deriveCostModel } from './costModel.js';
import { COST_CATEGORIES as CAT } from './taxonomy.js';
import { resolvePricing as dbPlatformPrice } from './pricingSourceRepository.js';
import { estimateConnectorCost as dbConnectorCost, resolveConnector as dbConnectorInfo } from './connectorProfileRepository.js';

const RANK = { unknown: 0, low: 1, medium: 2, high: 3 };
const toStr = (r) => Object.keys(RANK).find((k) => RANK[k] === r) || 'unknown';
const minConf = (a, b) => toStr(Math.min(RANK[a] ?? 0, RANK[b] ?? 0));
const round = (n) => Math.round((Number(n) || 0) * 1e6) / 1e6;

/**
 * @param {object} args
 * @param {object} args.blueprint
 * @param {string} args.platform
 * @param {number} [args.monthlyRuns]
 * @param {number} [args.runsPerEvent]
 * @param {number} [args.bundleMultiplier]
 * @param {string} [args.blueprintId]
 * @param {number} [args.blueprintVersion]
 * @param {object} [args.resolvers]  { platformPrice, connectorCost, connectorInfo } — for tests
 * @returns {Promise<object>} the Phase-6 estimate
 */
export async function buildCostEstimate({
  blueprint, platform, monthlyRuns = null, runsPerEvent = 1, bundleMultiplier = 1,
  blueprintId = null, blueprintVersion = null, resolvers = {},
}) {
  const platformPrice = resolvers.platformPrice || ((provider, ct) => dbPlatformPrice(provider, ct));
  const connectorCost = resolvers.connectorCost || ((sys, opts) => dbConnectorCost(sys, opts));
  const connectorInfo = resolvers.connectorInfo || ((sys, plat) => dbConnectorInfo(sys, plat));

  const model = deriveCostModel({ blueprint, platform, monthlyRuns, runsPerEvent, bundleMultiplier, blueprintId });
  const platformName = model.platform_name;

  const cost_components = [];
  const unknowns = new Set();

  // Build a priced component from a platform-price lookup. `structuralConf` is
  // our confidence in the QUANTITY/billing model — independent of whether the
  // price is known (a missing price shows up in `unknowns`, not as low
  // confidence in the quantity). Matches the spec: "task usage, price: null,
  // confidence: medium".
  const platformComponent = async ({ name, item, componentType, unknownLabel }) => {
    const p = await platformPrice(platform, componentType);
    const priced = p && p.price != null;
    const qty = item.quantity_estimate;
    cost_components.push({
      name,
      category: item.category,
      quantity: qty,
      unit: item.billing_unit,
      price: priced ? round(p.price) : null,
      line_cost: priced && Number.isFinite(qty) ? round(p.price * qty) : (priced ? null : null),
      confidence: priced ? minConf(item.confidence, p.confidence) : item.confidence,
      reason: priced
        ? `Unit price from ${p.source?.source_type || 'source'}${p.source?.pricing_url ? ` (${p.source.pricing_url})` : ''}.`
        : item.notes,
    });
    if (!priced && unknownLabel) unknowns.add(unknownLabel);
  };

  for (const item of model.items) {
    switch (item.category) {
      case CAT.ORCHESTRATION_PLATFORM.key:
        await platformComponent({
          name: `${platformName} subscription`, item, componentType: item.cost_type,
          unknownLabel: `Selected ${platformName} plan`,
        });
        break;

      case CAT.EXECUTION_TASK_CREDIT.key:
        await platformComponent({
          name: `${platformName} ${item.billing_unit} usage`, item, componentType: item.cost_type,
          unknownLabel: `Selected ${platformName} plan`,
        });
        break;

      case CAT.EXTERNAL_API_TOOL.key: {
        const qty = item.quantity_estimate;
        const [est, info] = await Promise.all([
          connectorCost(item.component, { monthlyUnits: qty, platform }),
          connectorInfo(item.component, platform),
        ]);
        const found = info && info.found;
        cost_components.push({
          name: item.component,
          category: item.category,
          quantity: qty,
          unit: 'api_call',
          price: found && info.unit_price != null ? round(info.unit_price) : null,
          line_cost: est && est.cost != null ? round(est.cost) : null,
          confidence: (est && est.confidence) || 'unknown',
          reason: found
            ? (est?.note || est?.reason || `Pricing model: ${info.pricing_model}.`)
            : 'No explicit API price configured.',
        });
        if (!est || est.cost == null) unknowns.add(`${item.component} pricing`);
        if (found && info.requires_paid_plan == null) unknowns.add(`Whether ${item.component} needs a paid/Premium plan`);
        break;
      }

      case CAT.LLM_TOKEN.key:
        cost_components.push({
          name: 'LLM tokens', category: item.category, quantity: item.quantity_estimate, unit: 'token',
          price: null, line_cost: null, confidence: 'unknown',
          reason: 'LLM model not selected; token price unknown.',
        });
        unknowns.add('LLM model & average token size');
        break;

      case CAT.MCP_CONNECTOR.key:
        cost_components.push({
          name: item.component, category: item.category, quantity: item.quantity_estimate, unit: 'connector',
          price: null, line_cost: null, confidence: 'low', reason: item.notes,
        });
        break;

      case CAT.HOSTING_INFRASTRUCTURE.key: {
        // A managed (SaaS) platform is a real $0 host; self-hosting has an
        // unknown VPS cost until priced.
        const managed = item.quantity_estimate === 0;
        if (managed) {
          cost_components.push({
            name: item.component, category: item.category, quantity: 0, unit: item.billing_unit,
            price: 0, line_cost: 0, confidence: item.confidence, reason: item.notes,
          });
        } else {
          const p = await platformPrice(platform, 'hosting');
          const priced = p && p.price != null;
          cost_components.push({
            name: item.component, category: item.category, quantity: item.quantity_estimate, unit: item.billing_unit,
            price: priced ? round(p.price) : null,
            line_cost: priced ? round(p.price * item.quantity_estimate) : null,
            confidence: item.confidence, reason: priced ? `Unit price from ${p.source?.source_type}.` : item.notes,
          });
          if (!priced) unknowns.add('Hosting / VPS cost');
        }
        break;
      }

      case CAT.STORAGE_LOGGING.key:
        cost_components.push({
          name: item.component, category: item.category, quantity: item.quantity_estimate ?? null, unit: item.billing_unit,
          price: null, line_cost: null, confidence: 'low', reason: item.notes,
        });
        break;

      case CAT.HUMAN_MANUAL_OPS.key:
        cost_components.push({
          name: item.component, category: item.category, quantity: item.quantity_estimate ?? null, unit: item.billing_unit,
          price: null, line_cost: null, confidence: 'low', reason: item.notes,
        });
        unknowns.add('Human review time & labour rate');
        break;

      case CAT.UNKNOWN.key:
      default:
        break; // the "unknown drivers" disclaimer feeds `unknowns`, not a line
    }
  }

  // Cross-cutting unknowns from the model.
  if (model.volume.assumed) unknowns.add('Actual monthly volume');
  if (model.metering.per_step?.some((s) => s.kind === 'filter' || s.kind === 'router')) {
    unknowns.add('Exact branch probability');
  }
  for (const u of (blueprint?.unknown_requirements || [])) {
    if (u?.blocks_cost_confidence && u.reason) unknowns.add(u.reason);
  }

  // Estimated units for the platform's metered line.
  const estimated_units = model.metering.monthly_units
    ? { [model.metering.primary_unit]: model.metering.monthly_units }
    : {};

  // Totals. The "core" cost is platform + tools + hosting; LLM / storage /
  // human / MCP are soft or variable and don't block the headline total (they'd
  // otherwise keep it null forever), but their known costs still add to the
  // subtotal and their gaps stay in `unknowns`.
  const CORE = new Set([
    CAT.ORCHESTRATION_PLATFORM.key, CAT.EXECUTION_TASK_CREDIT.key,
    CAT.EXTERNAL_API_TOOL.key, CAT.HOSTING_INFRASTRUCTURE.key,
  ]);
  const known = cost_components.filter((c) => typeof c.line_cost === 'number');
  const estimated_subtotal = known.length ? round(known.reduce((s, c) => s + c.line_cost, 0)) : null;

  const coreComps = cost_components.filter((c) => CORE.has(c.category));
  const coreAllPriced = coreComps.length > 0 && coreComps.every((c) => typeof c.line_cost === 'number');
  const estimated_total = coreAllPriced ? estimated_subtotal : null;
  const softUnpriced = cost_components.some((c) => !CORE.has(c.category) && c.line_cost == null && c.category !== CAT.UNKNOWN.key);

  // Overall confidence: weakest quantified line, floored by volume + metering.
  let overall = model.confidence;
  for (const c of cost_components) {
    if (c.category === CAT.UNKNOWN.key) continue;
    overall = minConf(overall, c.confidence);
  }

  return {
    blueprint_id: blueprintId,
    blueprint_version: blueprintVersion,
    platform,
    platform_name: platformName,
    monthly_volume: model.volume.monthly_runs,
    volume_assumed: model.volume.assumed,
    estimated_units,
    cost_components,
    unknowns: [...unknowns],
    currency: 'USD',
    estimated_subtotal,        // sum of KNOWN line costs incl. real $0s (may be partial)
    estimated_total,           // number once the CORE lines are priced, else null
    total_is_partial: estimated_total != null && softUnpriced, // core known, soft costs still unknown
    confidence: overall,
    phase: 6,
  };
}

export default { buildCostEstimate };
