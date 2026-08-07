/**
 * Adoption events + the dashboard aggregate (Phases 1.3–1.7).
 *
 * Score SIGNALS are derived from DURABLE tables (blueprints, generated
 * workflows, governance scans, opportunity map) so they're robust even before
 * events are wired for historical data; adoption_events drive the stage-journey
 * display and the two stages with no durable home (Discovered / Considered).
 */
import { pool } from '../../config/db.js';
import { isValidStage, STAGE_ORDER, stageIndex } from './stages.js';
import { getProfile } from './profileRepository.js';
import { listOpportunities, opportunityCounts, seedOpportunitiesForProfile } from './opportunityRepository.js';
import { computeAdoptionScore, buildAdoptionSignals } from './adoptionScore.js';

/** Append-only, best-effort — a logging failure never breaks the caller. */
export async function recordAdoptionEvent({ userId, stage, blueprintId = null, areaKey = null, metadata = null }) {
  try {
    if (!userId || !isValidStage(stage)) return false;
    await pool.query(
      'INSERT INTO adoption_events (user_id, stage, blueprint_id, area_key, metadata) VALUES (?,?,?,?,?)',
      [userId, stage, blueprintId, areaKey, metadata ? JSON.stringify(metadata) : null]
    );
    return true;
  } catch (err) {
    console.error('[adoption] failed to record event:', err.message);
    return false;
  }
}

/** Distinct stages this user has ever reached + the furthest one. */
export async function getStageReach(userId) {
  const [rows] = await pool.query('SELECT DISTINCT stage FROM adoption_events WHERE user_id = ?', [userId]);
  const reached = new Set(rows.map((r) => r.stage));
  let furthest = null, fi = -1;
  for (const s of reached) { const i = stageIndex(s); if (i > fi) { fi = i; furthest = s; } }
  return { reached, furthest, furthest_index: fi };
}

async function blueprintSignals(userId) {
  const [[bp]] = await pool.query(
    `SELECT COUNT(*) AS started,
            SUM(CASE WHEN status = 'requirements_complete' THEN 1 ELSE 0 END) AS completed
       FROM automation_blueprints WHERE user_id = ?`, [userId]);
  const [[wf]] = await pool.query(
    `SELECT COUNT(DISTINCT w.blueprint_id) AS prepared
       FROM blueprint_workflows w JOIN automation_blueprints b ON b.id = w.blueprint_id
      WHERE b.user_id = ?`, [userId]);
  const [[gov]] = await pool.query(
    `SELECT AVG(gs.readiness_pct) AS avg_readiness, COUNT(*) AS scanned
       FROM governance_scans gs
       JOIN (SELECT blueprint_id, MAX(id) AS mid FROM governance_scans GROUP BY blueprint_id) L ON L.mid = gs.id
       JOIN automation_blueprints b ON b.id = gs.blueprint_id
      WHERE b.user_id = ?`, [userId]);
  return {
    started: Number(bp.started) || 0,
    completed: Number(bp.completed) || 0,
    prepared: Number(wf.prepared) || 0,
    gov_avg: gov.avg_readiness == null ? null : Math.round(Number(gov.avg_readiness)),
    gov_scanned: Number(gov.scanned) || 0,
  };
}

function nextActions({ profile, counts, bpSig }) {
  const actions = [];
  if (!profile?.completed) actions.push({ key: 'complete_profile', label: 'Complete your profile', detail: 'Add your role, department and industry to personalise your opportunity map.', href: '/dashboard/profile' });
  if (bpSig.started === 0) actions.push({ key: 'start_blueprint', label: 'Start your first Blueprint', detail: 'Turn a top opportunity into an automation design.', href: '/' });
  else if (bpSig.completed === 0) actions.push({ key: 'complete_blueprint', label: 'Finish a Blueprint', detail: 'Answer the remaining questions to reach a buildable design.', href: '/' });
  else if (bpSig.prepared === 0) actions.push({ key: 'generate_workflow', label: 'Generate a workflow', detail: 'Build the workflow from a completed Blueprint.', href: '/' });
  else if (bpSig.gov_scanned === 0) actions.push({ key: 'run_scan', label: 'Run a governance scan', detail: 'Check a built workflow against security, privacy and policy.', href: '/' });
  if (counts.by_status?.suggested > 0) actions.push({ key: 'explore_opportunity', label: 'Explore an untapped opportunity', detail: `${counts.by_status.suggested} suggested area${counts.by_status.suggested === 1 ? '' : 's'} you haven't looked at yet.`, href: '/dashboard#opportunities' });
  return actions.slice(0, 4);
}

/** The full "Your AI Adaptability" dashboard payload (1.5–1.7). */
export async function getAdoptionDashboard(userId) {
  const profile = await getProfile(userId);
  // Seed the map on first load once we know a department (idempotent).
  if (profile && (profile.department || profile.role)) {
    await seedOpportunitiesForProfile(userId, profile).catch(() => {});
  }

  const [opportunities, counts, bpSig, stageReach] = await Promise.all([
    listOpportunities(userId).catch(() => []),
    opportunityCounts(userId).catch(() => ({ by_status: {}, total: 0, addressed: 0, engaged: 0, addressed_hours_month: 0 })),
    blueprintSignals(userId),
    getStageReach(userId).catch(() => ({ reached: new Set(), furthest: null, furthest_index: -1 })),
  ]);

  // ── Score signals (each 0..1) — via the shared builder ──
  const signals = buildAdoptionSignals({
    started: bpSig.started, completed: bpSig.completed, prepared: bpSig.prepared,
    govAvg: bpSig.gov_avg, engaged: counts.engaged, total: counts.total,
    activeWorkflows: 0, // Phase 3 confirmation — honestly 0 until then
    skill: profile?.technical_skill,
  });
  const score = computeAdoptionScore(signals);

  // ── 1.6 Coverage + estimated potential (labelled estimated) ──
  const potentialHours = opportunities.reduce((s, o) => s + (o.est_hours_month || 0), 0);
  const coverage = {
    addressed: counts.addressed,
    total: counts.total,
    label: `${counts.addressed} of ${counts.total} opportunities addressed`,
    estimated_hours_saved_month: counts.addressed_hours_month, // from addressed areas
    estimated_total_potential_month: potentialHours,           // if all addressed
    estimated_remaining_month: Math.max(0, potentialHours - counts.addressed_hours_month),
    is_estimate: true, // Phase 4 telemetry replaces these with measured values
  };

  // ── 1.6 top high-impact gaps (unaddressed, by estimated hours) ──
  const gaps = opportunities
    .filter((o) => o.status === 'suggested' || o.status === 'discovered' || o.status === 'considered')
    .sort((a, b) => (b.est_hours_month || 0) - (a.est_hours_month || 0))
    .slice(0, 5);

  // ── 1.7 skills & readiness ──
  const engagedComplex = opportunities.some((o) => o.blueprint_id && o.complexity === 'api');
  const skills = {
    technical_skill: profile?.technical_skill || null,
    readiness_note: profile?.technical_skill
      ? `Self-rated ${profile.technical_skill.replace('_', '-')}${engagedComplex ? '; has engaged API-level automations' : ''}.`
      : 'Add your technical skill level to tailor recommendations.',
    engaged_complexity: [...new Set(opportunities.filter((o) => o.blueprint_id).map((o) => o.complexity).filter(Boolean))],
  };

  return {
    profile,
    score,
    maturity: { level: score.band, label: score.band_label },
    opportunities,
    opportunity_counts: counts,
    stages: { reached: [...stageReach.reached], furthest: stageReach.furthest },
    blueprint_signals: bpSig,
    coverage,
    top_gaps: gaps,
    skills,
    next_actions: nextActions({ profile, counts, bpSig }),
  };
}

export default { recordAdoptionEvent, getStageReach, getAdoptionDashboard };
