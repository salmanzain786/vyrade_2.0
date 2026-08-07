/**
 * Implementation tracking (Phase 3). Confirms deployment / active status /
 * outcomes for a Blueprint, and — 3.4 — advances the progression taxonomy's
 * confirmation-only stages (Implemented / Active / Measured) from REAL user
 * confirmations instead of inference.
 */
import { pool } from '../../config/db.js';
import { recordAdoptionEvent } from './adoptionRepository.js';
import { STAGES } from './stages.js';

const PLATFORMS = new Set(['n8n', 'make', 'zapier', 'claude', 'custom']);
const toDate = (v) => { if (!v) return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10); };
const toIntOrNull = (v) => (v == null || v === '' ? null : (Number.isFinite(+v) ? Math.max(0, Math.trunc(+v)) : null));

export async function getImplementation(blueprintId) {
  const [[row]] = await pool.query('SELECT * FROM blueprint_implementations WHERE blueprint_id = ? LIMIT 1', [blueprintId]);
  if (!row) return null;
  return {
    blueprint_id: row.blueprint_id, implemented: !!row.implemented, active: !!row.active,
    platform: row.platform, deployed_at: row.deployed_at, owner: row.owner,
    usage_volume: row.usage_volume, time_saved_hours: row.time_saved_hours,
    outcome_notes: row.outcome_notes, measured: !!row.measured,
    minutes_saved_per_run: row.minutes_saved_per_run,
    implemented_at: row.implemented_at, updated_at: row.updated_at,
  };
}

/** 3.1 — confirm a workflow is deployed. Deploying implies active by default. */
export async function confirmImplemented({ blueprintId, userId, platform = null, deployedAt = null, owner = null }) {
  const p = platform && PLATFORMS.has(platform) ? platform : (platform || null);
  await pool.query(
    `INSERT INTO blueprint_implementations (blueprint_id, user_id, implemented, active, platform, deployed_at, owner, implemented_at)
       VALUES (?,?,1,1,?,?,?,CURRENT_TIMESTAMP)
     ON DUPLICATE KEY UPDATE implemented=1, active=1, platform=VALUES(platform), deployed_at=VALUES(deployed_at),
       owner=VALUES(owner), implemented_at=COALESCE(implemented_at, CURRENT_TIMESTAMP)`,
    [blueprintId, userId, p, toDate(deployedAt), owner ? String(owner).slice(0, 160) : null]
  );
  // 3.4 — real confirmation advances the taxonomy.
  recordAdoptionEvent({ userId, stage: STAGES.IMPLEMENTED, blueprintId });
  recordAdoptionEvent({ userId, stage: STAGES.ACTIVE, blueprintId });
  return getImplementation(blueprintId);
}

/** 3.2 — toggle active/inactive (independent of implemented). */
export async function setActive({ blueprintId, userId, active }) {
  await pool.query('UPDATE blueprint_implementations SET active = ? WHERE blueprint_id = ?', [active ? 1 : 0, blueprintId]);
  if (active) recordAdoptionEvent({ userId, stage: STAGES.ACTIVE, blueprintId }); // reactivation is a real signal
  return getImplementation(blueprintId);
}

/**
 * 3.3 — self-reported outcomes → "Measured". `minutesSavedPerRun` (4.4) is the
 * per-run rate; combined with MEASURED run volume (telemetry) it yields a real,
 * telemetry-derived hours-saved figure (see telemetryRepository).
 */
export async function reportOutcome({ blueprintId, userId, usageVolume = null, timeSavedHours = null, notes = null, minutesSavedPerRun = null }) {
  const uv = toIntOrNull(usageVolume), th = toIntOrNull(timeSavedHours), mpr = toIntOrNull(minutesSavedPerRun);
  const hasData = uv != null || th != null || mpr != null || (notes && String(notes).trim());
  await pool.query(
    `INSERT INTO blueprint_implementations (blueprint_id, user_id, usage_volume, time_saved_hours, outcome_notes, minutes_saved_per_run, measured)
       VALUES (?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE usage_volume=VALUES(usage_volume), time_saved_hours=VALUES(time_saved_hours),
       outcome_notes=VALUES(outcome_notes), minutes_saved_per_run=VALUES(minutes_saved_per_run), measured=VALUES(measured)`,
    [blueprintId, userId, uv, th, notes ? String(notes).slice(0, 1000) : null, mpr, hasData ? 1 : 0]
  );
  if (hasData) recordAdoptionEvent({ userId, stage: STAGES.MEASURED, blueprintId });
  return getImplementation(blueprintId);
}

/** Per-user active-implementation count — feeds the adoption score's active_workflows signal. */
export async function activeCountForUser(userId) {
  const [[row]] = await pool.query('SELECT COUNT(*) n FROM blueprint_implementations WHERE user_id = ? AND active = 1', [userId]);
  return Number(row.n) || 0;
}

export default { getImplementation, confirmImplemented, setActive, reportOutcome, activeCountForUser };
