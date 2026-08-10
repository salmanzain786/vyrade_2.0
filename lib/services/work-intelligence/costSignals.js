/**
 * Cost Intelligence enrichment (Phase 5.1). Derives task-based cost inputs for a
 * task-sourced Blueprint — frequency, assignees, estimated manual time,
 * recurrence, related-task count, average cycle delay, manual-review steps — so
 * the existing cost engine (and the user reviewing it) has grounded assumptions.
 * EVERYTHING here is an ESTIMATE and labelled as such, consistent with every
 * other estimate in Vyrade.
 */
import { pool } from '../../config/db.js';
import { getLink } from './writeback/taskLinkRepository.js';

const parseArr = (x) => { if (Array.isArray(x)) return x; if (typeof x === 'string') { try { const v = JSON.parse(x); return Array.isArray(v) ? v : []; } catch { return []; } } return []; };
const REVIEW_RE = /review|approve|approval|check|verify|sign.?off|qa/i;
const MINUTES_PER_STEP = 10; // directional

export async function taskCostSignals(blueprintId) {
  const link = await getLink(blueprintId);
  if (!link?.external_task_id) return null;
  const [[task]] = await pool.query(
    'SELECT recurrence, assignee_count, checklist, related_ids, due_date, task_created_at FROM ingested_tasks WHERE connection_id = ? AND external_id = ? LIMIT 1',
    [link.connection_id, link.external_task_id]
  );
  if (!task) return null;

  const checklistItems = parseArr(task.checklist).flatMap((c) => parseArr(c.items));
  const manualReviewSteps = checklistItems.filter((i) => REVIEW_RE.test(i.name || '')).length;
  const cycleDays = task.due_date && task.task_created_at
    ? Math.max(0, Math.round((new Date(task.due_date).getTime() - new Date(task.task_created_at).getTime()) / 86400_000))
    : null;

  return {
    is_estimate: true,
    recurring: !!task.recurrence,
    frequency_label: task.recurrence ? 'Recurring (assume monthly until confirmed)' : 'One-off / ad-hoc',
    assignees: task.assignee_count || 0,
    related_task_count: parseArr(task.related_ids).length,
    process_steps: checklistItems.length,
    estimated_manual_minutes: checklistItems.length ? checklistItems.length * MINUTES_PER_STEP : null,
    manual_review_steps: manualReviewSteps,
    average_cycle_days: cycleDays,
  };
}

export default { taskCostSignals };
