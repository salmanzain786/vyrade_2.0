/**
 * Organisation aggregation (Phase 2.3–2.6). Rolls up per-member Phase-1 data
 * into department, opportunity, platform and executive views. Every query is
 * scoped to the org's members (and, for managers, to one department), so nobody
 * sees data outside their access.
 *
 * Per-member scores use the SAME buildAdoptionSignals + computeAdoptionScore as
 * the individual dashboard, so an org rollup can never disagree with what a
 * member sees on their own dashboard.
 */
import { pool } from '../../config/db.js';
import { computeAdoptionScore, buildAdoptionSignals } from '../adoption/adoptionScore.js';
import { DEPARTMENT_LABEL } from '../adoption/catalog.js';
import { listMembers } from './membershipRepository.js';

const mapBy = (rows, key) => { const m = new Map(); for (const r of rows) m.set(r[key], r); return m; };
const parse = (x) => { try { return typeof x === 'string' ? JSON.parse(x) : (x || []); } catch { return []; } };

const SENSITIVE = ['pii_detected', 'special_category_data', 'sensitive_logging'];
const APPROVALS = ['approval_unspecified', 'policy_approval_missing'];
const NO_OWNER = ['no_owner_assigned'];

/** Per-member adoption scores + raw activity, scoped to a department if given. */
export async function perMemberScores(orgId, departmentFilter = null) {
  const members = await listMembers(orgId, { department: departmentFilter });
  if (!members.length) return [];
  const ids = members.map((m) => m.user_id);

  const [[bp], [wf], [gov], [opp], [prof]] = await Promise.all([
    pool.query("SELECT user_id, COUNT(*) started, SUM(status='requirements_complete') completed FROM automation_blueprints WHERE user_id IN (?) GROUP BY user_id", [ids]),
    pool.query('SELECT b.user_id, COUNT(DISTINCT w.blueprint_id) prepared FROM blueprint_workflows w JOIN automation_blueprints b ON b.id=w.blueprint_id WHERE b.user_id IN (?) GROUP BY b.user_id', [ids]),
    pool.query('SELECT b.user_id, AVG(gs.readiness_pct) avg FROM governance_scans gs JOIN (SELECT blueprint_id, MAX(id) mid FROM governance_scans GROUP BY blueprint_id) L ON L.mid=gs.id JOIN automation_blueprints b ON b.id=gs.blueprint_id WHERE b.user_id IN (?) GROUP BY b.user_id', [ids]),
    pool.query("SELECT user_id, COUNT(*) total, SUM(status IN ('discovered','considered','in_progress','addressed')) engaged FROM opportunity_map WHERE user_id IN (?) GROUP BY user_id", [ids]),
    pool.query('SELECT user_id, technical_skill FROM user_profiles WHERE user_id IN (?)', [ids]),
  ]);
  const bpM = mapBy(bp, 'user_id'), wfM = mapBy(wf, 'user_id'), govM = mapBy(gov, 'user_id'), oppM = mapBy(opp, 'user_id'), profM = mapBy(prof, 'user_id');

  return members.map((m) => {
    const b = bpM.get(m.user_id) || {}, w = wfM.get(m.user_id) || {}, g = govM.get(m.user_id) || {}, o = oppM.get(m.user_id) || {}, p = profM.get(m.user_id) || {};
    const started = Number(b.started) || 0, completed = Number(b.completed) || 0, prepared = Number(w.prepared) || 0;
    const govAvg = g.avg == null ? null : Math.round(Number(g.avg));
    const signals = buildAdoptionSignals({ started, completed, prepared, govAvg, engaged: Number(o.engaged) || 0, total: Number(o.total) || 0, skill: p.technical_skill });
    const sc = computeAdoptionScore(signals);
    return { user_id: m.user_id, email: m.email, name: m.name, role: m.role, department: m.department, score: sc.score, band: sc.band_label, started, completed, prepared, gov_avg: govAvg };
  });
}

/** 2.3 — aggregate scores by department. */
export async function departmentComparison(orgId, departmentFilter = null) {
  const members = await perMemberScores(orgId, departmentFilter);
  const byDept = new Map();
  for (const m of members) {
    const key = m.department || 'unassigned';
    if (!byDept.has(key)) byDept.set(key, { key, label: DEPARTMENT_LABEL[key] || 'Unassigned', members: 0, score_sum: 0, started: 0, completed: 0, prepared: 0 });
    const d = byDept.get(key);
    d.members += 1; d.score_sum += m.score; d.started += m.started; d.completed += m.completed; d.prepared += m.prepared;
  }
  return [...byDept.values()]
    .map((d) => ({ key: d.key, label: d.label, members: d.members, avg_score: d.members ? Math.round(d.score_sum / d.members) : 0, blueprints_started: d.started, blueprints_completed: d.completed, implementations: d.prepared, adoption_pct: d.members ? Math.round(d.score_sum / d.members) : 0 }))
    .sort((a, b) => b.avg_score - a.avg_score);
}

/** 2.4 — aggregate personal opportunity maps into an org view (deduped by area). */
export async function orgOpportunityMap(orgId, departmentFilter = null) {
  const members = await listMembers(orgId, { department: departmentFilter });
  if (!members.length) return { by_department: [], total_instances: 0 };
  const ids = members.map((m) => m.user_id);
  const [rows] = await pool.query(
    `SELECT department, area_key, label,
            COUNT(*) instances,
            SUM(status = 'addressed') addressed,
            SUM(status IN ('discovered','considered','in_progress')) in_progress,
            SUM(COALESCE(est_hours_month,0)) est_hours
       FROM opportunity_map WHERE user_id IN (?)
      GROUP BY department, area_key, label`,
    [ids]
  );
  const byDept = new Map();
  let totalInstances = 0;
  for (const r of rows) {
    const dep = r.department || 'general';
    if (!byDept.has(dep)) byDept.set(dep, { key: dep, label: DEPARTMENT_LABEL[dep] || dep, areas: [], instances: 0, addressed: 0 });
    const d = byDept.get(dep);
    d.areas.push({ area_key: r.area_key, label: r.label, people: Number(r.instances), addressed: Number(r.addressed), in_progress: Number(r.in_progress), est_hours_month: Number(r.est_hours) });
    d.instances += Number(r.instances); d.addressed += Number(r.addressed); totalInstances += Number(r.instances);
  }
  const by_department = [...byDept.values()]
    .map((d) => ({ ...d, distinct_areas: d.areas.length, areas: d.areas.sort((a, b) => b.people - a.people) }))
    .sort((a, b) => b.instances - a.instances);
  return { by_department, total_instances: totalInstances };
}

/** 2.5 — which platforms the org's built workflows actually use. */
export async function platformUsage(orgId, departmentFilter = null) {
  const members = await listMembers(orgId, { department: departmentFilter });
  if (!members.length) return { platforms: [], total: 0 };
  const ids = members.map((m) => m.user_id);
  const [rows] = await pool.query(
    `SELECT w.target platform, COUNT(DISTINCT w.blueprint_id) n
       FROM blueprint_workflows w JOIN automation_blueprints b ON b.id = w.blueprint_id
      WHERE b.user_id IN (?) GROUP BY w.target ORDER BY n DESC`,
    [ids]
  );
  const platforms = rows.map((r) => ({ platform: r.platform || 'n8n', count: Number(r.n) }));
  return { platforms, total: platforms.reduce((s, p) => s + p.count, 0) };
}

/** 2.6 — the 5-question executive rollup. */
export async function execReport(orgId, departmentFilter = null) {
  const members = await listMembers(orgId, { department: departmentFilter });
  const ids = members.map((m) => m.user_id);
  const [depts, opps, platforms] = await Promise.all([
    departmentComparison(orgId, departmentFilter),
    orgOpportunityMap(orgId, departmentFilter),
    platformUsage(orgId, departmentFilter),
  ]);

  let statusCounts = { collecting_requirements: 0, requirements_complete: 0, blocked: 0 };
  let cost = { total_cost: 0, conversations: 0 };
  let governance = { scanned: 0, no_owner: 0, missing_approvals: 0, sensitive_data: 0 };
  if (ids.length) {
    const [[st], [[c]], [gv]] = await Promise.all([
      pool.query('SELECT status, COUNT(*) n FROM automation_blueprints WHERE user_id IN (?) GROUP BY status', [ids]),
      pool.query('SELECT COALESCE(SUM(total_cost_usd),0) total_cost, COUNT(*) convos FROM conversations WHERE user_id IN (?)', [ids]),
      pool.query('SELECT gs.findings_json FROM governance_scans gs JOIN (SELECT blueprint_id, MAX(id) mid FROM governance_scans GROUP BY blueprint_id) L ON L.mid=gs.id JOIN automation_blueprints b ON b.id=gs.blueprint_id WHERE b.user_id IN (?)', [ids]),
    ]);
    for (const r of st) if (statusCounts[r.status] != null) statusCounts[r.status] = Number(r.n);
    cost = { total_cost: Number(c.total_cost) || 0, conversations: Number(c.convos) || 0 };
    governance.scanned = gv.length;
    for (const row of gv) {
      const f = parse(row.findings_json);
      const has = (types) => f.some((x) => types.includes(x.type));
      if (has(NO_OWNER)) governance.no_owner += 1;
      if (has(APPROVALS)) governance.missing_approvals += 1;
      if (has(SENSITIVE)) governance.sensitive_data += 1;
    }
  }

  const activeDepts = depts.filter((d) => d.blueprints_started > 0);
  const dormantDepts = depts.filter((d) => d.blueprints_started === 0);

  return {
    member_count: members.length,
    // Q1 — where are we using AI
    using_ai: activeDepts.map((d) => ({ label: d.label, score: d.avg_score, blueprints: d.blueprints_started })),
    // Q2 — where aren't we
    not_using_ai: dormantDepts.map((d) => ({ label: d.label, members: d.members })),
    untapped_opportunities: opps.total_instances,
    // Q3 — what's being built
    building: { ...statusCounts, total: Object.values(statusCounts).reduce((a, b) => a + b, 0), implementations: platforms.total },
    // Q4 — what's it costing
    cost,
    // Q5 — is it controlled
    governance,
    departments: depts,
    platforms: platforms.platforms,
  };
}

export default { perMemberScores, departmentComparison, orgOpportunityMap, platformUsage, execReport };
