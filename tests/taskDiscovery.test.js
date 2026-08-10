import { describe, it, expect } from 'vitest';
import { buildTaskContext, contextSummary } from '../lib/services/work-intelligence/discovery/context.js';
import { fallbackQuestions } from '../lib/services/work-intelligence/discovery/clarification.js';
import { buildProcessNarrative, unansweredCount } from '../lib/services/work-intelligence/discovery/narrative.js';

// An ingested-task row (already redacted) as stored in Phase 1.
const seoTask = {
  external_id: '86a1', platform: 'clickup', name: 'Monthly SEO reporting',
  description: 'Export GA4 and Search Console data, draft a performance summary, send to client for approval',
  status: 'in progress', project: 'Client A', recurrence: 1, subtask_count: 2, assignee_count: 1,
  checklist: JSON.stringify([{ name: 'Steps', items: [{ name: 'Export GA4', resolved: false }, { name: 'Send report for approval', resolved: false }] }]),
  tags: JSON.stringify(['reporting']),
};

describe('task context + signal detection (2.2)', () => {
  it('detects the automation signals the spec lists', () => {
    const ctx = buildTaskContext(seoTask);
    const keys = ctx.signals.map((s) => s.key);
    expect(keys).toEqual(expect.arrayContaining(['recurring', 'multiple_sources', 'drafting', 'approval', 'external_delivery']));
    expect(ctx.name).toBe('Monthly SEO reporting');
    expect(ctx.checklist[0].items).toHaveLength(2);
  });
  it('contextSummary is human-readable and lists signals', () => {
    const s = contextSummary(buildTaskContext(seoTask));
    expect(s).toMatch(/Task: Monthly SEO reporting/);
    expect(s).toMatch(/Detected signals/);
  });
});

describe('clarification engine (2.3) — deterministic fallback', () => {
  it('always asks the core questions and adds signal-gated ones', () => {
    const ctx = buildTaskContext(seoTask);
    const qs = fallbackQuestions(ctx);
    const ids = qs.map((q) => q.id);
    expect(ids).toContain('data_sources');   // always
    expect(ids).toContain('errors');         // always
    expect(ids).toContain('reviewer');       // approval signal present
    expect(ids).toContain('delivery');       // external_delivery signal present
    expect(qs.length).toBeGreaterThanOrEqual(5);
    expect(qs.length).toBeLessThanOrEqual(9);
    expect(qs.every((q) => q.id && q.question)).toBe(true);
  });
  it('a bare task gets only the always-on questions', () => {
    const ctx = buildTaskContext({ external_id: '1', name: 'Do a thing', description: '', checklist: '[]', tags: '[]' });
    const ids = fallbackQuestions(ctx).map((q) => q.id);
    expect(ids).toContain('data_sources');
    expect(ids).not.toContain('delivery');   // no external-delivery signal
  });
});

describe('narrative builder (2.4)', () => {
  const ctx = buildTaskContext(seoTask);
  const questions = fallbackQuestions(ctx);
  it('embeds answers and marks blanks as UNCERTAIN, never guessing', () => {
    const answers = { data_sources: 'GA4 + Search Console API', format: 'PDF from a template' };
    const n = buildProcessNarrative(ctx, questions, answers);
    expect(n).toMatch(/GA4 \+ Search Console API/);      // answered
    expect(n).toMatch(/UNCERTAIN|needs clarification/);   // blanks flagged
    expect(n).toMatch(/Monthly SEO reporting/);
    expect(n).toMatch(/do NOT invent/i);                  // instruction to the generator
  });
  it('unansweredCount tracks progress', () => {
    expect(unansweredCount(questions, {})).toBe(questions.length);
    expect(unansweredCount(questions, Object.fromEntries(questions.map((q) => [q.id, 'x'])))).toBe(0);
  });
});
