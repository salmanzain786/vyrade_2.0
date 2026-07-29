/**
 * Recommendation persistence (Task 3 DoD).
 *
 * Stores each recommendation the engine produces with its timestamp and input
 * version, so it's auditable and later exports can reference which
 * recommendation they followed. Append-only, but "insert-if-new": a save whose
 * full-content fingerprint already exists for this Blueprint version (matched
 * against ALL prior runs, not just the latest) returns the existing run instead
 * of piling up duplicate rows.
 */
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'node:crypto';
import { pool } from '../../config/db.js';
import { recommend } from './recommendationEngine.js';

const asJson = (v) => (typeof v === 'string' ? safeParse(v) : v);
const safeParse = (s) => { try { return JSON.parse(s); } catch { return null; } };
const toIso = (v) => (v == null ? null : (v instanceof Date ? v : new Date(v)).toISOString());

/**
 * Deterministic JSON: keys sorted recursively so two logically-equal objects
 * always stringify identically (property order can't change the hash).
 */
function stableStringify(v) {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v === undefined ? null : v);
}

/**
 * Content fingerprint of a recommendation. Hashes the FULL normalized
 * recommendation — reasoning, risks, alternatives, scores, cost assumptions,
 * tool intelligence — plus the volume input. Two runs are "the same" only when
 * every one of those is identical, so a change in reasoning/risks (even with the
 * same platform + confidence) produces a new hash and gets stored.
 *
 * Volatile/derived fields (generated_at, recommendation_id) are stripped so they
 * never affect the fingerprint.
 */
export function recommendationHash(recommendation, monthlyRuns = null) {
  const { generated_at, recommendation_id, ...rest } = recommendation || {};
  const payload = { rec: rest, monthly_runs: monthlyRuns == null ? null : Number(monthlyRuns) };
  return createHash('sha256').update(stableStringify(payload)).digest('hex');
}

/**
 * Persist a recommendation. Idempotent for an unchanged result.
 * @param {object} args { blueprintId, blueprintVersion, userId?, recommendation, monthlyRuns?, generatedAt? }
 * @returns {Promise<{ id, generated_at, stored }>}
 */
export async function saveRecommendation({
  blueprintId, blueprintVersion, userId = null, recommendation, monthlyRuns = null, generatedAt = null,
}) {
  if (!blueprintId || blueprintVersion == null || !recommendation) {
    throw new Error('[recommendation] blueprintId, blueprintVersion and recommendation are required');
  }
  const platform = recommendation.recommended?.platform ?? null;
  const confidence = recommendation.confidence ?? null;
  const engineVersion = recommendation.engine ?? 'rules-v1';

  // Skip a new row when an identical run ALREADY EXISTS for this exact input —
  // matched against EVERY prior run, not just the latest. That's what makes a
  // 5k → 10k → 5k sequence idempotent: the second 5k save finds the first 5k row
  // even though the 10k run is now newest. The full key is
  // (blueprint_id, blueprint_version, engine_version, monthly_runs,
  // recommendation_hash): the hash already fingerprints reasoning/risks/
  // alternatives/scores/cost + the engine + volume, and the explicit
  // engine_version + monthly_runs predicates make the input key self-documenting
  // (and guard against the astronomically-unlikely hash collision). `<=>` is
  // MySQL's null-safe equal so a NULL volume override matches a stored NULL.
  // Leading columns hit the idx_rec_hash index.
  const hash = recommendationHash(recommendation, monthlyRuns);
  const [existingRows] = await pool.query(
    `SELECT id, generated_at
       FROM recommendation_runs
      WHERE blueprint_id = ? AND blueprint_version = ? AND engine_version = ?
        AND monthly_runs <=> ? AND recommendation_hash = ?
      ORDER BY created_at DESC LIMIT 1`,
    [blueprintId, blueprintVersion, engineVersion, monthlyRuns == null ? null : Number(monthlyRuns), hash]
  );
  const existing = existingRows[0];
  if (existing) {
    return { id: existing.id, generated_at: toIso(existing.generated_at), stored: false, recommendation_hash: hash };
  }

  const id = uuidv4();
  const gen = generatedAt ? new Date(generatedAt) : new Date();
  await pool.query(
    `INSERT INTO recommendation_runs
       (id, blueprint_id, blueprint_version, user_id, recommended_platform, confidence,
        engine_version, monthly_runs, recommendation_hash, recommendation_json, generated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, blueprintId, blueprintVersion, userId, platform, confidence, engineVersion,
     monthlyRuns, hash, JSON.stringify(recommendation), gen]
  );
  return { id, generated_at: gen.toISOString(), stored: true, recommendation_hash: hash };
}

/** The most recent recommendation for a Blueprint (optionally a version). */
export async function getLatestRecommendation(blueprintId, version = null) {
  const where = version != null ? 'blueprint_id = ? AND blueprint_version = ?' : 'blueprint_id = ?';
  const params = version != null ? [blueprintId, version] : [blueprintId];
  const [rows] = await pool.query(
    `SELECT * FROM recommendation_runs WHERE ${where} ORDER BY created_at DESC LIMIT 1`,
    params
  );
  return rows[0] ? mapRun(rows[0]) : null;
}

/**
 * Architecture-first guarantee: ensure a recommendation exists for this
 * Blueprint version BEFORE an export/build, computing + storing one if missing.
 * Best-effort — a storage hiccup returns a computed (unstored) recommendation
 * rather than blocking the build.
 * @returns {Promise<{ id, recommended_platform, export_platform, recommendation }>}
 */
export async function ensureRecommendation({ blueprintId, blueprintVersion, userId = null, blueprint }) {
  const existing = await getLatestRecommendation(blueprintId, blueprintVersion).catch(() => null);
  if (existing) {
    return {
      id: existing.id,
      recommended_platform: existing.recommended_platform,
      export_platform: existing.recommendation?.recommended?.export_platform ?? null,
      recommendation: existing.recommendation,
    };
  }
  // None on file → compute + persist now (that's the enforcement).
  const rec = recommend({ blueprint, blueprintId, blueprintVersion });
  let id = null;
  try {
    const saved = await saveRecommendation({ blueprintId, blueprintVersion, userId, recommendation: rec, generatedAt: new Date() });
    id = saved.id;
  } catch (err) {
    console.error('[recommendation] ensure/save failed:', err.message);
  }
  return { id, recommended_platform: rec.recommended?.platform ?? null, export_platform: rec.recommended?.export_platform ?? null, recommendation: rec };
}

/**
 * The persisted run for an EXACT input — (blueprint_id, blueprint_version,
 * engine_version, monthly_runs) — not merely the latest run. This is what GET
 * should use: a saved run for monthly_runs=5000 must still be found even after a
 * newer run for monthly_runs=10000 becomes the latest. `<=>` is MySQL's
 * null-safe equal so a NULL volume override matches a stored NULL.
 */
export async function getRecommendationByInput(blueprintId, blueprintVersion, engineVersion, monthlyRuns) {
  const [rows] = await pool.query(
    `SELECT * FROM recommendation_runs
      WHERE blueprint_id = ? AND blueprint_version = ? AND engine_version = ? AND monthly_runs <=> ?
      ORDER BY created_at DESC LIMIT 1`,
    [blueprintId, blueprintVersion, engineVersion, monthlyRuns == null ? null : Number(monthlyRuns)]
  );
  return rows[0] ? mapRun(rows[0]) : null;
}

/** A specific recommendation run by id (for exports that reference it). */
export async function getRecommendationById(id) {
  const [rows] = await pool.query('SELECT * FROM recommendation_runs WHERE id = ?', [id]);
  return rows[0] ? mapRun(rows[0]) : null;
}

function mapRun(r) {
  return {
    id: r.id,
    blueprint_id: r.blueprint_id,
    blueprint_version: r.blueprint_version,
    user_id: r.user_id,
    recommended_platform: r.recommended_platform,
    confidence: r.confidence,
    engine_version: r.engine_version,
    monthly_runs: r.monthly_runs,
    recommendation_hash: r.recommendation_hash ?? null,
    generated_at: toIso(r.generated_at),
    recommendation: asJson(r.recommendation_json),
  };
}

export default { saveRecommendation, getLatestRecommendation, getRecommendationByInput, getRecommendationById, recommendationHash };
