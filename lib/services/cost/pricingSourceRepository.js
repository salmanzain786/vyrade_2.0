/**
 * Cost Intelligence — Phase 4: pricing source registry repository.
 *
 * Thin data access over `pricing_sources` (raw SQL via the shared pool, matching
 * workflowExampleRepository.js). Confidence governance is applied by
 * pricingSources.js — this module only reads/writes rows and composes the
 * "best source → governed price" lookup.
 */
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../../config/db.js';
import {
  SOURCE_TYPES, SOURCE_TYPE_VALUES, resolvePricingFromSource, noSourceResult,
} from './pricingSources.js';

// Prefer official pages, then higher stated confidence, then most recently
// verified. Encoded in SQL so "which source wins" is deterministic.
const BEST_SOURCE_SQL = `
  SELECT * FROM pricing_sources
   WHERE provider = ? AND component_type = ?
   ORDER BY FIELD(source_type,
              'official_pricing_page','official_help_doc','api_docs',
              'manual_entry','user_provided','inferred','unknown'),
            FIELD(confidence, 'high','medium','low','unknown'),
            last_checked_at DESC
   LIMIT 1`;

/** The single best source row for a component, or null. */
export async function getBestPricingSource(provider, componentType) {
  const [rows] = await pool.query(BEST_SOURCE_SQL, [provider, componentType]);
  return rows[0] || null;
}

/**
 * Resolve a governed price for (provider, componentType). Returns the honest
 * { price:null, confidence:'unknown', reason } when no source exists — the whole
 * point of the registry is that we'd rather say "unknown" than guess.
 */
export async function resolvePricing(provider, componentType) {
  const source = await getBestPricingSource(provider, componentType);
  return resolvePricingFromSource(source, { component: `${provider}/${componentType}` });
}

/** List sources, optionally filtered by provider and/or component_type. */
export async function listPricingSources({ provider = null, componentType = null } = {}) {
  const where = [];
  const params = [];
  if (provider) { where.push('provider = ?'); params.push(provider); }
  if (componentType) { where.push('component_type = ?'); params.push(componentType); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [rows] = await pool.query(
    `SELECT * FROM pricing_sources ${clause} ORDER BY provider, component_type, source_type`,
    params
  );
  return rows;
}

/**
 * Insert or update a source. Uniqueness is (provider, component_type,
 * source_type), so re-registering the same official page updates it in place
 * (fresh snapshot / parsed price / last_checked_at) rather than duplicating.
 */
export async function upsertPricingSource({
  provider, componentType, sourceType = SOURCE_TYPES.UNKNOWN,
  pricingUrl = null, extractionMethod = 'manual', confidence = 'unknown',
  rawSnapshot = null, parsedJson = null, notes = null, lastCheckedAt = null,
}) {
  if (!provider || !componentType) throw new Error('[pricing] provider and componentType are required');
  if (!SOURCE_TYPE_VALUES.has(sourceType)) throw new Error(`[pricing] invalid source_type '${sourceType}'`);

  const id = uuidv4();
  const parsed = parsedJson == null ? null : JSON.stringify(parsedJson);
  // MySQL DATETIME wants 'YYYY-MM-DD HH:MM:SS'; accept a Date, an ISO string, or
  // null (caller may pass a value; we don't call Date.now() implicitly).
  const checkedAt = lastCheckedAt instanceof Date ? lastCheckedAt : lastCheckedAt || null;

  await pool.query(
    `INSERT INTO pricing_sources
       (id, provider, component_type, pricing_url, source_type, extraction_method,
        confidence, raw_snapshot, parsed_json, notes, last_checked_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       pricing_url = VALUES(pricing_url),
       extraction_method = VALUES(extraction_method),
       confidence = VALUES(confidence),
       raw_snapshot = VALUES(raw_snapshot),
       parsed_json = VALUES(parsed_json),
       notes = VALUES(notes),
       last_checked_at = VALUES(last_checked_at)`,
    [id, provider, componentType, pricingUrl, sourceType, extractionMethod,
     confidence, rawSnapshot, parsed, notes, checkedAt]
  );
  return { id, provider, componentType, sourceType };
}

/** Stamp a source as re-verified now (caller supplies the timestamp). */
export async function touchLastChecked(id, checkedAt) {
  await pool.query('UPDATE pricing_sources SET last_checked_at = ? WHERE id = ?', [checkedAt || null, id]);
}

export { noSourceResult };
