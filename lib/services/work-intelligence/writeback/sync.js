/**
 * Progress write-back (Work Intelligence, Phase 4.1/4.2). Projects a Blueprint's
 * current lifecycle stage back onto its originating task — but ONLY when the
 * connection has write-back explicitly enabled (a SEPARATE consent from read).
 * Idempotent: writes only when the stage has advanced since last sync.
 */
import { pool } from '../../../config/db.js';
import { getConnection, accessTokenOf } from '../connectionRepository.js';
import { getConnector } from '../connectors/registry.js';
import { deriveLifecycleStage } from './lifecycle.js';
import { getLink, recordSync } from './taskLinkRepository.js';

async function gatherBlueprintState(blueprintId) {
  const [[bp]] = await pool.query('SELECT status FROM automation_blueprints WHERE id = ?', [blueprintId]);
  const [[wf]] = await pool.query('SELECT COUNT(*) n FROM blueprint_workflows WHERE blueprint_id = ?', [blueprintId]);
  const [[gov]] = await pool.query('SELECT COUNT(*) n FROM governance_scans WHERE blueprint_id = ?', [blueprintId]);
  const [[impl]] = await pool.query('SELECT implemented, active, measured FROM blueprint_implementations WHERE blueprint_id = ?', [blueprintId]);
  const complete = bp?.status === 'requirements_complete';
  return {
    blueprintStatus: bp?.status,
    hasRecommendation: complete,   // a recommendation is ensured at completeness
    hasCost: complete,             // cost is produced alongside the recommendation
    hasWorkflow: Number(wf?.n) > 0,
    govScanned: Number(gov?.n) > 0,
    implemented: !!impl?.implemented,
    active: !!impl?.active,
    measured: !!impl?.measured,
  };
}

/**
 * @param {{userId, blueprintId, appOrigin, force?}} args
 * @returns {{ok, reason?, stage, wrote}}
 */
export async function syncBlueprintProgress({ userId, blueprintId, appOrigin = '', force = false }) {
  const link = await getLink(blueprintId);
  if (!link || !link.external_task_id) return { ok: false, reason: 'not_task_linked', wrote: false };

  const connection = await getConnection(link.connection_id).catch(() => null);
  if (!connection || connection.status !== 'active') return { ok: false, reason: 'connection_inactive', wrote: false };

  // 4.1 — write-back is a SEPARATE, explicit permission from read.
  if (!connection.scope.write_back_enabled) return { ok: false, reason: 'write_back_disabled', wrote: false };

  const connector = getConnector(connection.platform);
  if (!connector?.supportsWriteback || !connector.postComment) return { ok: false, reason: 'platform_unsupported', wrote: false };

  const state = await gatherBlueprintState(blueprintId);
  const stage = deriveLifecycleStage(state);

  // Idempotent: skip if the stage hasn't advanced.
  if (!force && link.last_stage === stage.key) return { ok: true, stage, wrote: false, note: 'No change since last sync.' };

  const token = accessTokenOf(connection);
  if (!token) return { ok: false, reason: 'no_token', wrote: false };

  const link_url = appOrigin ? `${appOrigin}/report/${blueprintId}` : `/report/${blueprintId}`;
  const text = `🤖 Vyrade automation update — ${stage.label} (${stage.index + 1}/10).\nView the Blueprint: ${link_url}`;
  const result = await connector.postComment(token, link.external_task_id, text);

  await recordSync({ blueprintId, stage: stage.key, syncRef: result?.id || null, taskUrl: result?.url || null });
  return { ok: true, stage, wrote: true };
}

export default { syncBlueprintProgress };
