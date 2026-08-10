/**
 * Task context + signal detection (Work Intelligence, Phase 2.2).
 * Builds a structured, already-redacted context from an ingested task and
 * detects the automation-relevant signals the spec lists (recurring, multiple
 * data sources, drafting, approval, external delivery, …). Rules-based and
 * deterministic — cheap and explainable, upgradeable later.
 */
const parse = (x) => { try { return typeof x === 'string' ? JSON.parse(x) : (x || []); } catch { return []; } };

const SIGNAL_RULES = [
  { key: 'recurring', label: 'Recurring process', test: (c) => c.recurrence || /(weekly|monthly|daily|every|recurring)/i.test(c.text) },
  { key: 'multiple_sources', label: 'Multiple data sources', test: (c) => (c.text.match(/\b(export|import|pull|sheet|api|crm|ga4|analytics|database|report)\b/gi) || []).length >= 2 },
  { key: 'drafting', label: 'Drafting / content component', test: (c) => /\b(draft|write|summary|narrative|compose|content|blog)\b/i.test(c.text) },
  { key: 'approval', label: 'Human approval', test: (c) => /\b(approve|approval|review|sign.?off|confirm)\b/i.test(c.text) },
  { key: 'external_delivery', label: 'External delivery', test: (c) => /\b(send|email|deliver|client|publish|notify|share)\b/i.test(c.text) },
  { key: 'handoff', label: 'Multi-person handoff', test: (c) => c.assignee_count > 1 || /\b(handoff|assign|forward|escalate)\b/i.test(c.text) },
];

export function buildTaskContext(task) {
  const checklist = parse(task.checklist);
  const tags = parse(task.tags);
  const checklistText = checklist.map((c) => `${c.name || ''} ${(c.items || []).map((i) => i.name).join(' ')}`).join(' ');
  const text = [task.name, task.description, checklistText, tags.join(' ')].filter(Boolean).join('\n');

  const base = {
    external_task_id: task.external_id, platform: task.platform,
    name: task.name || 'Untitled task', description: task.description || '',
    status: task.status, project: task.project, list: task.list_name,
    recurrence: !!task.recurrence, subtask_count: task.subtask_count || 0,
    comment_count: task.comment_count || 0, assignee_count: task.assignee_count || 0,
    checklist, tags, due_date: task.due_date,
    text,
  };
  base.signals = SIGNAL_RULES.filter((r) => r.test(base)).map((r) => ({ key: r.key, label: r.label }));
  return base;
}

/** A compact, human-readable summary for prompts / display (no raw identity). */
export function contextSummary(ctx) {
  const lines = [
    `Task: ${ctx.name}`,
    ctx.project ? `Project: ${ctx.project}` : null,
    ctx.status ? `Status: ${ctx.status}` : null,
    ctx.recurrence ? 'Recurring: yes' : null,
    ctx.description ? `Description: ${ctx.description}` : null,
    ctx.checklist?.length ? `Checklist:\n${ctx.checklist.map((c) => `  - ${c.name}: ${(c.items || []).map((i) => i.name).join(', ')}`).join('\n')}` : null,
    ctx.signals?.length ? `Detected signals: ${ctx.signals.map((s) => s.label).join(', ')}` : null,
  ];
  return lines.filter(Boolean).join('\n');
}

export default { buildTaskContext, contextSummary };
