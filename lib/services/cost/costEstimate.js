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
import { freshnessOf, agedConfidence, freshnessLabel } from './freshness.js';
import { tradeoffFor } from './platformTradeoffs.js';

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
  blueprintId = null, blueprintVersion = null, resolvers = {}, now = Date.now(),
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
    const lastChecked = priced ? (p.source?.last_checked_at || null) : null;
    const fr = freshnessOf(lastChecked, now);
    // Base confidence, then aged down: a stale price is no longer trustworthy.
    const confidence = priced ? agedConfidence(minConf(item.confidence, p.confidence), fr.status) : item.confidence;
    if (priced && fr.status === 'stale') unknowns.add(`${name} price may be outdated`);
    cost_components.push({
      name,
      category: item.category,
      quantity: qty,
      unit: item.billing_unit,
      price: priced ? round(p.price) : null,
      line_cost: priced && Number.isFinite(qty) ? round(p.price * qty) : (priced ? null : null),
      confidence,
      source: priced ? (p.source?.source_type || 'source') : null,
      source_url: priced ? (p.source?.pricing_url || null) : null,
      last_checked: lastChecked,
      freshness: priced ? fr.status : null,
      freshness_label: priced ? freshnessLabel(fr.status) : null,
      age_days: priced ? fr.age_days : null,
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
        const toolChecked = found ? (info.last_checked_at || null) : null;
        const toolFr = freshnessOf(toolChecked, now);
        const toolConf = agedConfidence((est && est.confidence) || 'unknown', toolFr.status);
        cost_components.push({
          name: item.component,
          category: item.category,
          quantity: qty,
          unit: 'api_call',
          price: found && info.unit_price != null ? round(info.unit_price) : null,
          line_cost: est && est.cost != null ? round(est.cost) : null,
          confidence: toolConf,
          source: found ? (info.pricing_model || 'profile') : null,
          source_url: found ? (info.pricing_url || null) : null,
          last_checked: toolChecked,
          freshness: found ? toolFr.status : null,
          freshness_label: found ? freshnessLabel(toolFr.status) : null,
          age_days: found ? toolFr.age_days : null,
          reason: found
            ? (est?.note || est?.reason || `Pricing model: ${info.pricing_model}.`)
            : 'No explicit API price configured.',
        });
        if (!est || est.cost == null) unknowns.add(`${item.component} pricing`);
        else if (toolFr.status === 'stale') unknowns.add(`${item.component} price may be outdated`);
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

  // Platform cost vs. TOTAL automation cost. Splitting the bill into these three
  // buckets is what stops the comparison from collapsing to "X is cheapest":
  //   platform    — what the platform bills to run it (metered + subscription)
  //   operational — hosting, storage, and human time you're responsible for
  //   usage       — external APIs + LLM tokens, which scale with what you connect
  const GROUP_OF = {
    [CAT.ORCHESTRATION_PLATFORM.key]: 'platform',
    [CAT.EXECUTION_TASK_CREDIT.key]: 'platform',
    [CAT.HOSTING_INFRASTRUCTURE.key]: 'operational',
    [CAT.STORAGE_LOGGING.key]: 'operational',
    [CAT.HUMAN_MANUAL_OPS.key]: 'operational',
    [CAT.EXTERNAL_API_TOOL.key]: 'usage',
    [CAT.LLM_TOKEN.key]: 'usage',
    [CAT.MCP_CONNECTOR.key]: 'usage',
  };
  const cost_groups = { platform: emptyGroup(), operational: emptyGroup(), usage: emptyGroup() };
  for (const c of cost_components) {
    const g = cost_groups[GROUP_OF[c.category]];
    if (!g) continue;
    g.components += 1;
    if (typeof c.line_cost === 'number') g.known = round((g.known ?? 0) + c.line_cost);
    else g.has_unpriced = true;
  }

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
    assumptions: model.assumptions,     // volume basis + framing + metering notes
    currency: 'USD',
    // "Known monthly cost" is the honest headline — the sum of lines we actually
    // have a price for. `estimated_total` is only non-null once EVERY core line
    // is priced, so the UI must never show a lone total without that guarantee.
    known_monthly_cost: estimated_subtotal,
    // Platform cost vs. total automation cost, so the UI can show that a low
    // platform bill may sit next to high operational responsibility.
    cost_groups,
    tradeoff: tradeoffFor(platform),
    estimated_subtotal,        // (alias) sum of KNOWN line costs incl. real $0s
    estimated_total,           // number once the CORE lines are priced, else null
    // "fully priced" = every CORE line (platform + tools + hosting) has a price,
    // which is exactly when a total is defensible. Soft costs (storage/human)
    // are informational and never block this — `total_is_partial` flags them.
    fully_priced: coreAllPriced,
    total_is_partial: coreAllPriced && softUnpriced, // core known, soft costs still unknown
    priced_components: known.length,
    total_components: cost_components.filter((c) => c.category !== CAT.UNKNOWN.key).length,
    confidence: overall,
    phase: 6,
  };
}

function emptyGroup() {
  return { known: 0, has_unpriced: false, components: 0 };
}

export default { buildCostEstimate };
