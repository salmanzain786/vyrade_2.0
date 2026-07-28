/**
 * Export provenance — stamps each build with the recommendation it followed.
 *
 * Fire-and-forget: recording provenance must never break an export/generation.
 */
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../../config/db.js';

const DEBUG = process.env.NODE_ENV !== 'production';

/**
 * @param {object} r { blueprintId, blueprintVersion, userId?, selectedPlatform,
 *                     kind?, recommendation? } where recommendation is the
 *                     ensureRecommendation() result { id, export_platform, recommended_platform }
 * @returns {Promise<{ id, followed }|null>}
 */
export async function recordExportRun({ blueprintId, blueprintVersion, userId = null, selectedPlatform, kind = null, recommendation = null }) {
  if (!blueprintId || !selectedPlatform) return null;
  const id = uuidv4();
  const recId = recommendation?.id ?? null;
  const recPlatform = recommendation?.recommended_platform ?? null;
  const recExport = recommendation?.export_platform ?? null;
  const followed = recExport == null ? null : (recExport === selectedPlatform ? 1 : 0);
  try {
    await pool.query(
      `INSERT INTO export_runs
         (id, blueprint_id, blueprint_version, user_id, selected_platform, kind,
          recommendation_id, recommended_platform, followed_recommendation)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, blueprintId, blueprintVersion ?? 0, userId, selectedPlatform, kind, recId, recPlatform, followed]
    );
    return { id, followed };
  } catch (err) {
    if (DEBUG) console.warn('[export] recordExportRun failed:', err.message);
    return null;
  }
}

export default { recordExportRun };
