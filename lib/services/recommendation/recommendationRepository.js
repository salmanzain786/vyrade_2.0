/**
 * Recommendation persistence (Task 3 DoD).
 *
 * Stores each recommendation the engine produces with its timestamp and input
 * version, so it's auditable and later exports can reference which
 * recommendation they followed. Append-only, but "insert-if-changed": a repeated
 * identical recommendation (same platform + confidence + engine) returns the
 * existing run instead of piling up duplicate rows.
 */
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../../config/db.js';
import { recommend } from './recommendationEngine.js';

const asJson = (v) => (typeof v === 'string' ? safeParse(v) : v);
const safeParse = (s) => { try { return JSON.parse(s); } catch { return null; } };
const toIso = (v) => (v == null ? null : (v instanceof Date ? v : new Date(v)).toISOString());

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

  // Skip a new row when the latest run for this exact input is identical. The
  // input key is (blueprint_id, blueprint_version, engine, monthly_runs) — so a
  // different volume override is treated as a distinct, storable recommendation.
  const nrun = (x) => (x == null ? null : Number(x));
  const [latestRows] = await pool.query(
    `SELECT id, generated_at, recommended_platform, confidence, engine_version, monthly_runs
       FROM recommendation_runs
      WHERE blueprint_id = ? AND blueprint_version = ?
      ORDER BY created_at DESC LIMIT 1`,
    [blueprintId, blueprintVersion]
  );
  const latest = latestRows[0];
  if (latest && latest.recommended_platform === platform && latest.confidence === confidence
      && latest.engine_version === engineVersion && nrun(latest.monthly_runs) === nrun(monthlyRuns)) {
    return { id: latest.id, generated_at: toIso(latest.generated_at), stored: false };
  }

  const id = uuidv4();
  const gen = generatedAt ? new Date(generatedAt) : new Date();
  await pool.query(
    `INSERT INTO recommendation_runs
       (id, blueprint_id, blueprint_version, user_id, recommended_platform, confidence,
        engine_version, monthly_runs, recommendation_json, generated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, blueprintId, blueprintVersion, userId, platform, confidence, engineVersion,
     monthlyRuns, JSON.stringify(recommendation), gen]
  );
  return { id, generated_at: gen.toISOString(), stored: true };
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
    generated_at: toIso(r.generated_at),
    recommendation: asJson(r.recommendation_json),
  };
}

export default { saveRecommendation, getLatestRecommendation, getRecommendationById };
