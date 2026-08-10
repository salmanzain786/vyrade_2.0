/**
 * Work Intelligence funnel (Phase 5.4). Aggregates the full task→outcome funnel
 * the spec describes, reusing the tables Phases 2–4 already produce — no new
 * tracking. Reuses the adoption-stage taxonomy's spirit (a real funnel, not
 * inferred). Org-wide (admin ops view).
 */
import { pool } from '../../config/db.js';

const n = (r) => Number(r?.n) || 0;

export async function workFunnel() {
  const [
    [[tasks]], [oppRows], [[links]], [[complete]], [[prepared]], [[deployed]], [[measured]], [[analyzedConns]],
  ] = await Promise.all([
    pool.query('SELECT COUNT(*) n FROM ingested_tasks'),
    pool.query('SELECT status, COUNT(*) n FROM work_opportunities GROUP BY status'),
    pool.query('SELECT COUNT(*) n FROM blueprint_task_links'), // task-sourced Blueprints
    pool.query("SELECT COUNT(*) n FROM blueprint_task_links l JOIN automation_blueprints b ON b.id = l.blueprint_id WHERE b.status = 'requirements_complete'"),
    pool.query('SELECT COUNT(DISTINCT l.blueprint_id) n FROM blueprint_task_links l JOIN blueprint_workflows w ON w.blueprint_id = l.blueprint_id'),
    pool.query('SELECT COUNT(*) n FROM blueprint_task_links l JOIN blueprint_implementations i ON i.blueprint_id = l.blueprint_id WHERE i.active = 1'),
    pool.query('SELECT COUNT(*) n FROM blueprint_task_links l JOIN blueprint_implementations i ON i.blueprint_id = l.blueprint_id WHERE i.measured = 1'),
    pool.query('SELECT COUNT(DISTINCT connection_id) n FROM ingested_tasks'),
  ]);

  const opp = {}; let oppTotal = 0;
  for (const r of oppRows) { opp[r.status] = n(r); oppTotal += n(r); }
  const accepted = (opp.accepted || 0) + (opp.reviewing || 0) + (opp.blueprint_created || 0);

  const stages = [
    { key: 'tasks_analysed', label: 'Tasks analysed', count: n(tasks) },
    { key: 'opportunities_identified', label: 'Opportunities identified', count: oppTotal },
    { key: 'opportunities_accepted', label: 'Opportunities accepted', count: accepted },
    { key: 'blueprints_started', label: 'Blueprints started', count: n(links) },
    { key: 'blueprints_approved', label: 'Blueprints complete', count: n(complete) },
    { key: 'implementations_prepared', label: 'Implementations prepared', count: n(prepared) },
    { key: 'deployed', label: 'Workflows deployed', count: n(deployed) },
    { key: 'measured', label: 'Outcomes measured', count: n(measured) },
  ];

  // Step-to-step conversion (relative to the previous non-zero stage).
  let prev = null;
  for (const s of stages) {
    s.conversion_pct = prev && prev > 0 ? Math.round((s.count / prev) * 100) : null;
    prev = s.count;
  }

  return { stages, connections: n(analyzedConns), opportunity_status: opp };
}

export default { workFunnel };
