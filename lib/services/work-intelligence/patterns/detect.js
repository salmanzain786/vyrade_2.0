/**
 * Recurring-work pattern detection (Work Intelligence, Phase 3.1).
 *
 * Rules-based first (the "start deterministic, upgrade later" philosophy used for
 * the curated opportunity catalog): explainable signals over authorized task
 * metadata — repeated names, recurrence, copied-across-projects, consistent
 * checklists, approval bottlenecks, reopened/rework, multi-person handoffs.
 * Every finding carries EVIDENCE (task ids/projects) so a human can trust it
 * ("this name appeared 14 times") rather than a black-box cluster.
 *
 * Input: ingested_tasks rows (already redacted). No raw identity is used —
 * people are counted via hashed assignee_refs only.
 */
const parseArr = (x) => { if (Array.isArray(x)) return x; if (typeof x === 'string') { try { const v = JSON.parse(x); return Array.isArray(v) ? v : []; } catch { return []; } } return []; };

const MONTHS = 'jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december';

/** Canonicalize a task name so "Monthly report — Jan 2026" == "Monthly report - Feb 2026". */
export function normalizeTaskName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(new RegExp(`\\b(${MONTHS})\\b`, 'g'), '')
    .replace(/\b(19|20)\d{2}\b/g, '')          // years
    .replace(/\b\d{1,2}[/.-]\d{1,2}([/.-]\d{2,4})?\b/g, '') // dates
    .replace(/#?\d+/g, '')                      // numbers / ids
    .replace(/\b(q[1-4]|week|wk|day)\b/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A structural fingerprint of a checklist (sorted, normalized item names). */
function checklistFingerprint(checklist) {
  const items = parseArr(checklist).flatMap((c) => parseArr(c.items).map((i) => normalizeTaskName(i.name))).filter(Boolean).sort();
  return items.length >= 2 ? items.join('|') : null;
}

const groupBy = (arr, keyFn) => { const m = new Map(); for (const x of arr) { const k = keyFn(x); if (!k) continue; if (!m.has(k)) m.set(k, []); m.get(k).push(x); } return m; };
const uniq = (a) => [...new Set(a.filter(Boolean))];
const REOPEN_RE = /reopen|redo|rework/i;

/**
 * @param {Array} tasks ingested_tasks rows
 * @param {{minGroup?:number}} opts
 * @returns {Array} findings: { signal, pattern_key, label, task_ids, task_count, project_count, people_count, projects }
 */
export function detectPatterns(tasks = [], { minGroup = 3 } = {}) {
  const findings = [];
  const evidence = (group) => ({
    task_ids: group.map((t) => t.external_id).filter(Boolean).slice(0, 100),
    projects: uniq(group.map((t) => t.project)),
    people: uniq(group.flatMap((t) => parseArr(t.assignee_refs))),
  });
  const add = (signal, key, label, group) => {
    const ev = evidence(group);
    findings.push({ signal, pattern_key: key, label, task_ids: ev.task_ids, task_count: group.length, project_count: ev.projects.length, people_count: ev.people.length, projects: ev.projects });
  };

  // 1 + 5 — repeated names, and the subset copied across ≥2 projects.
  for (const [key, group] of groupBy(tasks, (t) => normalizeTaskName(t.name))) {
    if (group.length < minGroup) continue;
    const projects = uniq(group.map((t) => t.project));
    add(projects.length >= 2 ? 'copied_across_projects' : 'repeated_name', key, group[0].name, group);
  }

  // 2 — recurring tasks (by name).
  for (const [key, group] of groupBy(tasks.filter((t) => t.recurrence), (t) => normalizeTaskName(t.name))) {
    if (group.length < 2) continue;
    add('recurring', key, group[0].name, group);
  }

  // 8 — consistent checklist structure.
  for (const [fp, group] of groupBy(tasks, (t) => checklistFingerprint(t.checklist))) {
    if (group.length < minGroup) continue;
    add('consistent_checklist', fp.slice(0, 180), `${parseArr(group[0].checklist).flatMap((c) => parseArr(c.items)).length}-step checklist repeated`, group);
  }

  // 10 — approval bottlenecks (approval-ish tasks stuck open).
  const approvalStuck = tasks.filter((t) => /\b(approve|approval|review|sign.?off)\b/i.test(`${t.name} ${t.description}`) && !/(done|closed|complete)/i.test(t.status || ''));
  if (approvalStuck.length >= minGroup) add('approval_bottleneck', 'approval', 'Work waiting on review/approval', approvalStuck);

  // 11 — reopened / rework (status churn or reopen wording).
  const reopened = tasks.filter((t) => parseArr(t.status_history).length >= 3 || REOPEN_RE.test(`${t.name} ${t.description}`));
  if (reopened.length >= minGroup) add('reopened', 'reopened', 'Tasks reopened / reworked (often incomplete data)', reopened);

  // 4 — high-volume manual handoffs (multi-assignee), grouped by name.
  for (const [key, group] of groupBy(tasks.filter((t) => (t.assignee_count || 0) > 1), (t) => normalizeTaskName(t.name))) {
    if (group.length < minGroup) continue;
    add('handoff', key, group[0].name, group);
  }

  return findings.sort((a, b) => b.task_count - a.task_count);
}

export default { detectPatterns, normalizeTaskName };
