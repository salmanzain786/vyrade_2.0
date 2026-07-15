import { describe, it, expect } from 'vitest';
import { baseBlueprint } from './fixtures.js';
import { materialGaps, openQuestions, checkReadiness } from '../lib/services/readiness.js';
import { prepareQuestion } from '../lib/services/clarificationAgent.js';

describe('readiness — complete blueprint', () => {
  it('a fully specified blueprint is requirements_complete', () => {
    const r = checkReadiness(baseBlueprint());
    expect(r.status).toBe('requirements_complete');
    expect(r.blocking_unknowns).toEqual([]);
    expect(r.score).toBe(100);
  });
});

describe('QA case 3 — unknown volume', () => {
  it('null volume surfaces a non-blocking gap; recording it clears the gap', () => {
    const bp = baseBlueprint({
      volume: { estimated_executions: null, period: null, confidence: 'unknown' },
    });
    const gaps = materialGaps(bp).map((g) => g.path);
    expect(gaps).toContain('volume.estimated_executions');
    // Volume unknown does not block generation.
    const r = checkReadiness(bp);
    expect(r.status).toBe('requirements_complete');
    expect(r.non_blocking_unknowns).toContain('volume.estimated_executions');

    // Once recorded as an accepted unknown, it stops being re-asked.
    bp.unknown_requirements = [
      { field_path: 'volume.estimated_executions', reason: 'user unsure', blocks_generation: false, blocks_cost_confidence: true },
    ];
    const gaps2 = materialGaps(bp).map((g) => g.path);
    expect(gaps2).not.toContain('volume.estimated_executions');
  });
});

describe('QA case 6 — incomplete blueprint is not ready', () => {
  it('a missing business goal is a blocking gap → not complete', () => {
    const bp = baseBlueprint({
      business_intent: { business_goal: '', desired_outcome: '' },
    });
    const r = checkReadiness(bp);
    expect(r.status).toBe('collecting_requirements');
    expect(r.blocking_unknowns).toContain('business_intent.business_goal');
  });
});

describe('P1-8 — clarification loop fix (without silencing questions)', () => {
  it('fresh human_approval (null, not recorded) forces a streamed question', () => {
    const bp = baseBlueprint({ human_approval: { required: null, approval_points: [] } });
    const q = openQuestions(bp).find((g) => g.path === 'human_approval.required');
    expect(q).toBeTruthy();
    expect(q.blocking).toBe(true);
    expect(checkReadiness(bp).status).toBe('collecting_requirements');

    const prep = prepareQuestion(bp, 'User: hi');
    expect(prep.done).toBeFalsy();
    expect(prep.allowDone).toBe(false); // structural blocker → MUST_ASK (streamed)
  });

  it('once human_approval is declined, the interview may finish (no forced re-ask loop)', () => {
    const bp = baseBlueprint({
      human_approval: { required: null, approval_points: [] },
      unknown_requirements: [
        { field_path: 'human_approval.required', reason: 'user does not know', blocks_generation: true, blocks_cost_confidence: false },
      ],
    });

    // Not a structural must-have anymore (recorded) → the agent is ALLOWED to
    // end instead of being forced to repeat the same question forever.
    const prep = prepareQuestion(bp, "Vyrade: Does a person approve?\nUser: I don't know");
    expect(prep.done).toBeFalsy();     // model is still consulted...
    expect(prep.allowDone).toBe(true); // ...but may respond DONE (loop broken)
  });
});

describe('regression — model-flagged unknowns are ASKED, not dumped as field paths', () => {
  it('fresh blocking unknowns remain open questions and drive a question, not a dead-end', () => {
    const bp = baseBlueprint({
      human_approval: { required: true, approval_points: [] }, // no structural blocker
      unknown_requirements: [
        { field_path: 'systems.Spreadsheet.location_and_access', reason: 'where the spreadsheet lives', blocks_generation: true, blocks_cost_confidence: false },
        { field_path: 'data_inputs.recipient_email.column_name', reason: 'which column holds the email', blocks_generation: true, blocks_cost_confidence: false },
      ],
    });

    const paths = openQuestions(bp).map((g) => g.path);
    expect(paths).toContain('systems.Spreadsheet.location_and_access');
    expect(paths).toContain('data_inputs.recipient_email.column_name');

    // The interview does NOT prematurely end — it proceeds to ask about them.
    const prep = prepareQuestion(bp, 'User: send 10k emails from my sheet');
    expect(prep.done).toBeFalsy();

    // And they surface as plain-English blocking questions, never raw paths.
    const r = checkReadiness(bp);
    expect(r.status).toBe('collecting_requirements');
    expect(r.blocking_questions.length).toBeGreaterThan(0);
    expect(r.blocking_questions.join(' ')).not.toContain('field_path');
  });
});

describe('conditional gaps', () => {
  it('retry gap only appears when a write_data step exists and no retry rule is set', () => {
    const withWrite = baseBlueprint({ retry_requirements: [] });
    expect(materialGaps(withWrite).map((g) => g.path)).toContain('retry_requirements');

    const noWrite = baseBlueprint({
      process_steps: [{ step_id: 's1', sequence: 1, action: 'Read', action_type: 'receive_data' }],
      retry_requirements: [],
    });
    expect(materialGaps(noWrite).map((g) => g.path)).not.toContain('retry_requirements');
  });
});
