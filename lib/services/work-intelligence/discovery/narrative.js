/**
 * Task + answers → process narrative (Work Intelligence, Phase 2.4).
 *
 * This is the "new input source" for Vyrade's EXISTING Blueprint generator — we
 * synthesize a process brief from the task context and the employee's
 * clarification answers, then hand it to generateAndValidate unchanged. Crucially,
 * unanswered questions are surfaced as EXPLICIT uncertainty, so the generator
 * marks them for clarification rather than silently guessing.
 */
import { contextSummary } from './context.js';

export function buildProcessNarrative(ctx, questions = [], answers = {}) {
  const qa = questions.map((q) => {
    const a = (answers[q.id] || '').trim();
    return a ? `Q: ${q.question}\nA: ${a}` : `Q: ${q.question}\nA: (not provided — treat as UNCERTAIN / needs clarification)`;
  });

  return [
    'An employee wants to turn the following work task into an automation. Use it as the entry point, not the final spec — build a structured Blueprint (objective, trigger, inputs, process steps, systems, business rules, approvals, exceptions, outputs).',
    '',
    contextSummary(ctx),
    '',
    'PROCESS CLARIFICATIONS:',
    ...qa,
    '',
    'IMPORTANT: For any aspect the answers did not cover, mark it explicitly as uncertain / needing clarification in the Blueprint — do NOT invent details.',
  ].join('\n');
}

/** How many clarification questions still have no answer (drives "ready" state). */
export function unansweredCount(questions = [], answers = {}) {
  return questions.filter((q) => !((answers[q.id] || '').trim())).length;
}

export default { buildProcessNarrative, unansweredCount };
