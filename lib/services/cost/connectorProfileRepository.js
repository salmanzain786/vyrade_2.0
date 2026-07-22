/**
 * Cost Intelligence — Phase 5: connector pricing profile repository.
 *
 * Data access over `connector_cost_profiles` (raw SQL via the shared pool).
 * Governance + estimation are in connectorProfiles.js — this module reads/writes
 * rows and composes the "best profile for a system → governed cost" lookup.
 */
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../../config/db.js';
import {
  PRICING_MODELS, PRICING_MODEL_VALUES,
  resolveConnectorProfile, estimateConnectorMonthlyCost, noProfileResult,
} from './connectorProfiles.js';

// Platform-agnostic profiles use the sentinel 'any' (NOT NULL), because a NULL
// in the UNIQUE (connector_name, platform) index would never collide — so an
// upsert couldn't dedupe and re-seeding would pile up duplicate rows.
export const ANY_PLATFORM = 'any';

// Match by system name (as it appears in the Blueprint). Prefer a profile
// scoped to the target platform, then a platform-agnostic one, then higher
// confidence, then most-recently verified.
const BEST_BY_SYSTEM_SQL = `
  SELECT * FROM connector_cost_profiles
   WHERE (system_name = ? OR connector_name = ?)
   ORDER BY (platform = ?) DESC,
            (platform = 'any') DESC,
            FIELD(confidence, 'high','medium','low','unknown'),
            last_checked_at DESC
   LIMIT 1`;

/** The single best profile for a Blueprint system, or null. */
export async function getConnectorProfile(systemName, platform = null) {
  const [rows] = await pool.query(BEST_BY_SYSTEM_SQL, [systemName, systemName, platform]);
  return rows[0] || null;
}

/** Governed, typed profile summary for a system — or the honest "not found". */
export async function resolveConnector(systemName, platform = null) {
  const row = await getConnectorProfile(systemName, platform);
  return resolveConnectorProfile(row, { systemName });
}

/** Estimated monthly cost this connector adds for a given usage volume. */
export async function estimateConnectorCost(systemName, { monthlyUnits = 0, platform = null } = {}) {
  const row = await getConnectorProfile(systemName, platform);
  if (!row) return noProfileResult(systemName);
  return estimateConnectorMonthlyCost(row, { monthlyUnits });
}

/** List profiles, optionally filtered by platform and/or system_name. */
export async function listConnectorProfiles({ platform = null, systemName = null } = {}) {
  const where = [];
  const params = [];
  if (platform) { where.push('platform = ?'); params.push(platform); }
  if (systemName) { where.push('system_name = ?'); params.push(systemName); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [rows] = await pool.query(
    `SELECT * FROM connector_cost_profiles ${clause} ORDER BY connector_name, platform`,
    params
  );
  return rows;
}

/**
 * Insert or update a profile. Uniqueness is (connector_name, platform), so
 * refreshing an existing profile updates it in place.
 */
export async function upsertConnectorProfile({
  connectorName, platform = ANY_PLATFORM, connectorId = null, systemName = null,
  pricingModel = PRICING_MODELS.UNKNOWN, pricingUrl = null,
  freeTierAvailable = null, requiresPaidPlan = null,
  unitName = null, unitPrice = null, includedUnits = null, overagePrice = null,
  rateLimitNotes = null, confidence = 'unknown', notes = null, lastCheckedAt = null,
}) {
  if (!connectorName) throw new Error('[connector] connectorName is required');
  if (!PRICING_MODEL_VALUES.has(pricingModel)) throw new Error(`[connector] invalid pricing_model '${pricingModel}'`);

  const id = uuidv4();
  const plat = platform == null ? ANY_PLATFORM : platform; // never store NULL (see ANY_PLATFORM)
  const bool = (v) => (v == null ? null : v ? 1 : 0);

  await pool.query(
    `INSERT INTO connector_cost_profiles
       (id, connector_id, connector_name, platform, system_name, pricing_model, pricing_url,
        free_tier_available, requires_paid_plan, unit_name, unit_price, included_units,
        overage_price, rate_limit_notes, confidence, notes, last_checked_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       connector_id = VALUES(connector_id),
       system_name = VALUES(system_name),
       pricing_model = VALUES(pricing_model),
       pricing_url = VALUES(pricing_url),
       free_tier_available = VALUES(free_tier_available),
       requires_paid_plan = VALUES(requires_paid_plan),
       unit_name = VALUES(unit_name),
       unit_price = VALUES(unit_price),
       included_units = VALUES(included_units),
       overage_price = VALUES(overage_price),
       rate_limit_notes = VALUES(rate_limit_notes),
       confidence = VALUES(confidence),
       notes = VALUES(notes),
       last_checked_at = VALUES(last_checked_at)`,
    [id, connectorId, connectorName, plat, systemName, pricingModel, pricingUrl,
     bool(freeTierAvailable), bool(requiresPaidPlan), unitName, unitPrice, includedUnits,
     overagePrice, rateLimitNotes, confidence, notes, lastCheckedAt || null]
  );
  return { id, connectorName, platform };
}

export { noProfileResult };
