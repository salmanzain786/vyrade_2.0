import { describe, it, expect } from 'vitest';
import { orgScope, resolveScope, canSeeWholeOrg, canManageMembers, canInvite } from '../lib/services/org/access.js';
import { buildAdoptionSignals, computeAdoptionScore } from '../lib/services/adoption/adoptionScore.js';

describe('org access policy (2.2)', () => {
  it('owner/admin see the whole org; manager is department-scoped; member sees nothing', () => {
    expect(orgScope('owner')).toBe('org');
    expect(orgScope('admin')).toBe('org');
    expect(orgScope('manager')).toBe('department');
    expect(orgScope('member')).toBe('none');
  });

  it('a manager is limited to their own department', () => {
    expect(resolveScope({ role: 'manager', department: 'marketing' })).toEqual({ scope: 'department', departmentFilter: 'marketing' });
    expect(resolveScope({ role: 'admin', department: 'marketing' })).toEqual({ scope: 'org', departmentFilter: null });
  });

  it('member-management + invite are owner/admin only', () => {
    expect(canManageMembers('manager')).toBe(false);
    expect(canManageMembers('admin')).toBe(true);
    expect(canInvite('member')).toBe(false);
    expect(canInvite('owner')).toBe(true);
    expect(canSeeWholeOrg('manager')).toBe(false);
  });
});

describe('shared adoption signal builder (used by individual AND org rollup)', () => {
  it('normalises raw activity into 0..1 signals with the documented targets', () => {
    const s = buildAdoptionSignals({ started: 3, completed: 3, prepared: 2, govAvg: 100, engaged: 5, total: 5, skill: 'developer' });
    expect(s.blueprints_started).toBe(1);       // 3/3 target
    expect(s.implementations_prepared).toBe(1); // 2/2 target
    expect(s.governance_completion).toBe(1);
    expect(s.opportunities_explored).toBe(1);
    expect(s.skills_readiness).toBe(1);         // developer
    // Ceiling WITHOUT confirmed active workflows is 90 (active_workflows weight
    // 0.10 stays 0 until Phase 3 confirmation) — an honest cap, not 100.
    expect(computeAdoptionScore(s).score).toBe(90);
    // With a confirmed-active workflow it reaches 100.
    expect(computeAdoptionScore(buildAdoptionSignals({ started: 3, completed: 3, prepared: 2, govAvg: 100, engaged: 5, total: 5, skill: 'developer', activeWorkflows: 1 })).score).toBe(100);
  });

  it('an empty member scores 0 — the org rollup and the personal dashboard agree', () => {
    const s = buildAdoptionSignals({});
    expect(computeAdoptionScore(s).score).toBe(0);
  });

  it('caps over-target activity at the signal ceiling', () => {
    const s = buildAdoptionSignals({ started: 99, completed: 99, prepared: 99, govAvg: 100, engaged: 1, total: 1, skill: 'developer' });
    expect(s.blueprints_started).toBe(1);
    expect(computeAdoptionScore(s).score).toBe(90); // 90 ceiling until active workflows confirmed
  });
});
