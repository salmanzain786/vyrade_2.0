import { describe, it, expect } from 'vitest';
import { baseBlueprint } from './fixtures.js';
import {
  validateBlueprint,
  validateContradictions,
  validateSequence,
  validateReferential,
  checkNeutrality,
} from '../lib/schema/blueprintSchema.js';

describe('current_process_type — captures the process state (no "manual" assumption)', () => {
  it('accepts every valid state', () => {
    for (const t of ['manual', 'partially_automated', 'existing_workflow', 'migration', 'unknown']) {
      expect(() => validateBlueprint(baseBlueprint({ current_process_type: t }))).not.toThrow();
    }
  });

  it('is a required field (present on the base fixture)', () => {
    const { current_process_type, ...withoutIt } = baseBlueprint();
    expect(() => validateBlueprint(withoutIt)).toThrow(/current_process_type/);
  });

  it('rejects an out-of-enum value', () => {
    expect(() => validateBlueprint(baseBlueprint({ current_process_type: 'semi' }))).toThrow();
  });
});

describe('QA case 4 — contradictory business rules', () => {
  const rule = (id, action, val) => ({
    rule_id: id,
    description: `${id}`,
    condition: { field: 'state', operator: 'equals', value: ['California'] },
    result: { action, value: val },
  });

  it('same condition resolving to different results fails', () => {
    const bp = baseBlueprint({
      process_steps: [{ step_id: 's1', sequence: 1, action: 'Decide', action_type: 'business_decision' }],
      business_rules: [rule('r1', 'assign', 'Sarah'), rule('r2', 'assign', 'John')],
    });
    const errors = validateContradictions(bp);
    expect(errors.length).toBeGreaterThan(0);
    expect(() => validateBlueprint(bp)).toThrow(/contradict/i);
  });

  it('same condition resolving to the SAME result is fine', () => {
    const bp = baseBlueprint({
      business_rules: [rule('r1', 'assign', 'Sarah'), rule('r2', 'assign', 'Sarah')],
    });
    expect(validateContradictions(bp)).toEqual([]);
  });
});

describe('referential + sequence validation', () => {
  it('a retry rule referencing an undeclared system fails referential check', () => {
    const bp = baseBlueprint({
      retry_requirements: [{ system: 'Salesforce', max_retries: 2, after_final_failure: null }],
    });
    expect(validateReferential(bp).length).toBeGreaterThan(0);
  });

  it('non-ascending process step sequence fails', () => {
    const bp = baseBlueprint({
      process_steps: [
        { step_id: 's1', sequence: 2, action: 'a', action_type: 'receive_data' },
        { step_id: 's2', sequence: 1, action: 'b', action_type: 'write_data' },
      ],
    });
    expect(validateSequence(bp).length).toBeGreaterThan(0);
  });
});

describe('P2 — neutrality with implementation_constraints', () => {
  it('a banned platform term inside the business process fails', () => {
    const bp = baseBlueprint({
      business_intent: { business_goal: 'Build an n8n switch node flow', desired_outcome: 'x' },
    });
    expect(checkNeutrality(bp).length).toBeGreaterThan(0);
  });

  it('the SAME platform recorded as a user constraint is allowed (exempt subtree)', () => {
    const bp = baseBlueprint();
    bp.constraints.implementation_constraints.required_platforms = ['n8n'];
    expect(checkNeutrality(bp)).toEqual([]);
    // And the whole blueprint still validates.
    expect(() => validateBlueprint(bp)).not.toThrow();
  });
});

describe('full validation happy path', () => {
  it('the base fixture is a valid blueprint', () => {
    expect(() => validateBlueprint(baseBlueprint())).not.toThrow();
  });
});
