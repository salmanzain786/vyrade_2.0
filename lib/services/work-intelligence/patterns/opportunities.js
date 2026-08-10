/**
 * Opportunity naming + estimation (Work Intelligence, Phase 3.2).
 * Turns raw pattern findings into named opportunities matching the spec's own
 * examples ("Monthly reporting across 14 client projects", "Lead-data cleanup
 * repeated by six sales employees"). Hours are a DIRECTIONAL estimate, labelled.
 */

// Rough per-task monthly hours by signal (directional, hand-tunable — same
// philosophy as the curated catalog's est_hours).
const HOURS_PER_TASK = { recurring: 3, repeated_name: 2, copied_across_projects: 2.5, consistent_checklist: 2, approval_bottleneck: 1.5, reopened: 2, handoff: 2, repeated_subtask: 1.5, long_duration: 2, status_churn: 1.5, common_tool: 1 };

function titleFor(f) {
  const name = (f.label || 'Recurring work').replace(/\s+/g, ' ').trim();
  switch (f.signal) {
    case 'copied_across_projects': return `${name} across ${f.project_count} projects`;
    case 'recurring': return `Recurring: ${name} (${f.task_count}×)`;
    case 'consistent_checklist': return `${name} (${f.task_count} tasks)`;
    case 'approval_bottleneck': return `Review/approval bottleneck (${f.task_count} tasks)`;
    case 'reopened': return `Reopened/reworked tasks (${f.task_count})`;
    case 'handoff': return f.people_count > 1 ? `${name} repeated by ${f.people_count} people` : `${name} (${f.task_count}×, multi-owner)`;
    case 'repeated_subtask': return `Repeated subtask: ${name} (${f.task_count}×)`;
    case 'long_duration': return `Long-running / overdue work (${f.task_count} tasks)`;
    case 'status_churn': return `Frequent status changes (${f.task_count} tasks)`;
    case 'common_tool': return `${name} (${f.task_count} tasks)`;
    default: return `${name} (${f.task_count}×)`;
  }
}

export function toOpportunity(finding) {
  const est = Math.round((HOURS_PER_TASK[finding.signal] || 2) * finding.task_count);
  return {
    signal: finding.signal,
    pattern_key: finding.pattern_key,
    title: titleFor(finding),
    task_count: finding.task_count,
    project_count: finding.project_count,
    people_count: finding.people_count,
    est_hours_month: est,           // estimate
    evidence: { task_ids: finding.task_ids, projects: finding.projects },
  };
}

export function buildOpportunities(findings = []) {
  return findings.map(toOpportunity).sort((a, b) => b.est_hours_month - a.est_hours_month);
}

export default { buildOpportunities, toOpportunity };
