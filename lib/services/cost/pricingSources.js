/**
 * Cost Intelligence — Phase 4: pricing source governance.
 *
 * Pure policy for the `pricing_sources` registry (no DB here — see
 * pricingSourceRepository.js). The one rule that matters:
 *
 *     Only official pricing/help pages can produce a HIGH-confidence price.
 *     Everything else is capped lower, and NO source at all resolves to
 *     { price: null, confidence: 'unknown' } — never a hallucinated number.
 *
 * This is the guardrail that keeps the whole cost engine honest once real
 * prices start flowing in.
 */

/** Allowed provenance types (mirrors the spec's source_type list). */
export const SOURCE_TYPES = {
  OFFICIAL_PRICING_PAGE: 'official_pricing_page',
  OFFICIAL_HELP_DOC: 'official_help_doc',
  API_DOCS: 'api_docs',
  MANUAL_ENTRY: 'manual_entry',
  USER_PROVIDED: 'user_provided',
  INFERRED: 'inferred',
  UNKNOWN: 'unknown',
};
export const SOURCE_TYPE_VALUES = new Set(Object.values(SOURCE_TYPES));

const RANK = { unknown: 0, low: 1, medium: 2, high: 3 };
const byRank = (r) => Object.keys(RANK).find((k) => RANK[k] === r) || 'unknown';
const minConfidence = (a, b) => byRank(Math.min(RANK[a] ?? 0, RANK[b] ?? 0));

/**
 * The MAXIMUM confidence a price is allowed to carry, given where it came from.
 * This is the enforcement of "only official pages → high": no matter what a row
 * claims, an inferred/manual source can never resolve to 'high'.
 */
export const MAX_CONFIDENCE_BY_SOURCE = {
  official_pricing_page: 'high',
  official_help_doc: 'high',
  api_docs: 'medium',
  manual_entry: 'medium',
  user_provided: 'low',
  inferred: 'low',
  unknown: 'unknown',
};

/** True only for the two source types that may yield a high-confidence price. */
export function isOfficialSource(sourceType) {
  return sourceType === SOURCE_TYPES.OFFICIAL_PRICING_PAGE
      || sourceType === SOURCE_TYPES.OFFICIAL_HELP_DOC;
}

/**
 * Governed confidence for a price: the lower of what the row claims and the cap
 * for its source type. A `manual_entry` row that claims 'high' is clamped to
 * 'medium'; an `inferred` claim of 'high' becomes 'low'.
 */
export function confidenceForSourceType(sourceType, claimed = null) {
  const cap = MAX_CONFIDENCE_BY_SOURCE[sourceType] ?? 'unknown';
  return claimed ? minConfidence(claimed, cap) : cap;
}

/** The canonical "no price" result — the honest alternative to guessing. */
export function noSourceResult(component = null) {
  return {
    price: null,
    confidence: 'unknown',
    reason: `No official pricing source found for this component${component ? ` (${component})` : ''}.`,
  };
}

const asJson = (v) => {
  if (v == null) return null;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return null; } }
  return v;
};

/**
 * Resolve a governed pricing result from the best source row (or null).
 * Pure: the repository does the DB lookup and hands the row here.
 *
 * @param {object|null} source  a pricing_sources row (snake_case columns) or null
 * @param {object} [opts]
 * @param {string} [opts.component]  label used in the "no source" reason
 * @returns {{ price:number|null, currency?:string, confidence:string, reason?:string, source?:object, parsed?:object }}
 */
export function resolvePricingFromSource(source, { component = null } = {}) {
  if (!source) return noSourceResult(component);

  const parsed = asJson(source.parsed_json ?? source.parsedJson);
  const meta = sourceMeta(source);

  // A source can exist (we know WHERE to look) before it has a parsed price.
  if (!parsed || parsed.price == null) {
    return {
      price: null,
      confidence: 'unknown',
      reason: 'A pricing source is registered but has no parsed price yet.',
      source: meta,
    };
  }

  const claimed = source.confidence ?? source.confidence_level ?? null;
  return {
    price: Number(parsed.price),
    currency: parsed.currency || 'USD',
    confidence: confidenceForSourceType(meta.source_type, claimed),
    source: meta,
    parsed,
  };
}

/** Compact, non-sensitive view of a source row for attaching to a price. */
export function sourceMeta(source) {
  return {
    id: source.id,
    provider: source.provider,
    component_type: source.component_type ?? source.componentType,
    source_type: source.source_type ?? source.sourceType,
    pricing_url: source.pricing_url ?? source.pricingUrl ?? null,
    last_checked_at: source.last_checked_at ?? source.lastCheckedAt ?? null,
    official: isOfficialSource(source.source_type ?? source.sourceType),
  };
}

export default {
  SOURCE_TYPES, MAX_CONFIDENCE_BY_SOURCE, isOfficialSource,
  confidenceForSourceType, noSourceResult, resolvePricingFromSource, sourceMeta,
};
