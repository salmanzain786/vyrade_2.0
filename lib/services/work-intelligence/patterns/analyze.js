/**
 * Organisation-wide analysis orchestrator (Work Intelligence, Phase 3.1–3.2/3.4).
 * Loads authorized tasks (all, or one project — the two modes of 3.4), runs the
 * rules-based detector, names the opportunities, and upserts them. Nothing here
 * is auto-approved — opportunities land as `suggested` for review (3.3).
 */
import { getActiveConnection } from '../connectionRepository.js';
import { getMembership } from '../../org/membershipRepository.js';
import { listTasksForAnalysis } from '../ingestedTaskRepository.js';
import { detectPatterns } from './detect.js';
import { buildOpportunities } from './opportunities.js';
import { upsertOpportunities } from './opportunityRepository.js';

/**
 * @param {{userId, platform?, mode?, project?}} args
 *   mode: 'recurring' (all authorized tasks) | 'project' (one project)
 */
export async function analyzeWork({ userId, platform = 'clickup', mode = 'recurring', project = null }) {
  const connection = await getActiveConnection(userId, platform).catch(() => null);
  if (!connection) return { ok: false, reason: 'no_connection', opportunities: [] };

  const tasks = await listTasksForAnalysis(userId, { connectionId: connection.id, project: mode === 'project' ? project : null });
  if (!tasks.length) return { ok: true, analyzed: 0, opportunities: [], note: mode === 'project' ? 'No tasks in that project.' : 'No tasks to analyse — sync first.' };

  const findings = detectPatterns(tasks);
  const opportunities = buildOpportunities(findings);

  const membership = await getMembership(userId).catch(() => null);
  const saved = await upsertOpportunities({ userId, orgId: membership?.org_id || null, connectionId: connection.id, opportunities });

  return { ok: true, analyzed: tasks.length, detected: opportunities.length, saved, opportunities };
}

export default { analyzeWork };
