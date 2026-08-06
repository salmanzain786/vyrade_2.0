import { describe, it, expect } from 'vitest';
import { comparePolicyToWorkflow, detectVersionDrift } from '../lib/services/scanner/policyDetectors.js';
import { normalizePolicy, deriveDefaultPolicy, policyHasConstraints } from '../lib/services/scanner/policy.js';
import { scanWorkflow } from '../lib/services/scanner/scan.js';

// Minimal model helpers.
const node = (over = {}) => ({ id: '1', name: 'N', type: 'n8n-nodes-base.noOp', shortType: 'noOp', app: null, isTrigger: false, isWebhook: false, isHttp: false, isAI: false, isBrowser: false, parameters: {}, credentials: {}, retryOnFail: false, maxTries: null, ...over });
const model = (nodes, over = {}) => ({ platform: 'n8n', name: 'wf', nodes, connections: [], triggerIds: [], hasErrorHandling: false, raw: {}, ...over });
const on = (patch) => normalizePolicy({ enabled: true, ...patch });

describe('policy diff engine (6.2)', () => {
  it('produces NOTHING when the policy is disabled or empty (no noise)', () => {
    const m = model([node({ isAI: true, type: 'n8n-nodes-base.openAi' })]);
    expect(comparePolicyToWorkflow({ policy: normalizePolicy({}), model: m })).toEqual([]); // disabled
    expect(comparePolicyToWorkflow({ policy: on({}), model: m })).toEqual([]);               // enabled but no constraints
  });

  it('flags an external AI model when forbidden', () => {
    const m = model([node({ isAI: true, type: '@n8n/n8n-nodes-langchain.lmChatOpenAi', app: 'openai' })]);
    const f = comparePolicyToWorkflow({ policy: on({ data_handling: { allow_external_ai_models: false } }), model: m });
    expect(f.map((x) => x.type)).toContain('policy_external_model_used');
    expect(f[0].severity).toBe('high');
  });

  it('does NOT flag a self-hosted model as external', () => {
    const m = model([node({ isAI: true, type: 'n8n-nodes-base.ollama', app: 'ollama' })]);
    const f = comparePolicyToWorkflow({ policy: on({ data_handling: { allow_external_ai_models: false } }), model: m });
    expect(f.map((x) => x.type)).not.toContain('policy_external_model_used');
  });

  it('flags forbidden + missing-required platforms', () => {
    const m = model([node({ app: 'slack' })]);
    const f = comparePolicyToWorkflow({ policy: on({ platform_policy: { forbidden_platforms: ['slack'], required_platforms: ['salesforce'] } }), model: m });
    const types = f.map((x) => x.type);
    expect(types).toContain('policy_forbidden_platform');
    expect(types).toContain('policy_missing_required_platform');
  });

  it('flags a personal credential when org-owned is required', () => {
    const m = model([node({ credentials: { gmail: { name: 'My personal gmail' } } })]);
    const f = comparePolicyToWorkflow({ policy: on({ credential_policy: { require_org_owned: true } }), model: m });
    expect(f.map((x) => x.type)).toContain('policy_personal_credential');
  });

  it('flags missing error branch + retry over limit', () => {
    const m = model([node({ isHttp: true, maxTries: 5, retryOnFail: true })], { hasErrorHandling: false });
    const f = comparePolicyToWorkflow({ policy: on({ error_handling: { require_error_branch: true, max_retries: 3 } }), model: m });
    const types = f.map((x) => x.type);
    expect(types).toContain('policy_error_branch_missing');
    expect(types).toContain('policy_retry_limit_exceeded');
  });

  it('flags missing approval unless the workflow OR blueprint provides one', () => {
    const m = model([node({ type: 'n8n-nodes-base.httpRequest', isHttp: true })]);
    const pol = on({ approvals: { require_human_approval: true, approval_actions: ['before refunds'] } });
    expect(comparePolicyToWorkflow({ policy: pol, model: m, blueprint: {} }).map((x) => x.type)).toContain('policy_approval_missing');
    // Satisfied by a workflow approval node…
    const withGate = model([node({ type: 'n8n-nodes-base.wait', name: 'Await approval' })]);
    expect(comparePolicyToWorkflow({ policy: pol, model: withGate, blueprint: {} }).map((x) => x.type)).not.toContain('policy_approval_missing');
    // …or by the Blueprint declaring it.
    expect(comparePolicyToWorkflow({ policy: pol, model: m, blueprint: { human_approval: { required: true } } }).map((x) => x.type)).not.toContain('policy_approval_missing');
  });

  it('flags missing alerting from the Blueprint side (no workflow needed)', () => {
    const f = comparePolicyToWorkflow({ policy: on({ alerting: { require_incident_alert: true } }), model: null, blueprint: {} });
    expect(f.map((x) => x.type)).toContain('policy_alerting_missing');
  });
});

describe('version drift (6.3)', () => {
  it('flags an outdated workflow origin version', () => {
    const f = detectVersionDrift({ workflowVersion: 2, currentVersion: 5 });
    expect(f[0].type).toBe('workflow_version_drift');
    expect(f[0].detail).toMatch(/v2.*v5|3 versions behind/);
  });
  it('is silent when up-to-date or unknown', () => {
    expect(detectVersionDrift({ workflowVersion: 5, currentVersion: 5 })).toEqual([]);
    expect(detectVersionDrift({ workflowVersion: null, currentVersion: 5 })).toEqual([]);
  });
});

describe('policy model (6.1)', () => {
  it('normalizes junk into the canonical shape, permissive by default', () => {
    const p = normalizePolicy({ enabled: 'yes', platform_policy: { hosting: 'weird', forbidden_platforms: ['A', 'a', ''] } });
    expect(p.enabled).toBe(false);                    // non-boolean → default
    expect(p.platform_policy.hosting).toBe('any');    // invalid → any
    expect(p.platform_policy.forbidden_platforms).toEqual(['a']); // deduped + lowercased
    expect(p.error_handling.max_retries).toBeNull();
  });
  it('derives a starting policy from the Blueprint retry limit + approval', () => {
    const d = deriveDefaultPolicy({ retry_requirements: [{ max_retries: 2 }, { max_retries: 3 }], human_approval: { required: true } });
    expect(d.error_handling.max_retries).toBe(3);
    expect(d.approvals.require_human_approval).toBe(true);
    expect(d.enabled).toBe(false); // stays off until a human enables it
  });
  it('policyHasConstraints detects an active constraint', () => {
    expect(policyHasConstraints(normalizePolicy({}))).toBe(false);
    expect(policyHasConstraints(on({ credential_policy: { require_org_owned: true } }))).toBe(true);
  });
});

describe('report integration (6.4)', () => {
  const wf = { name: 'x', nodes: [{ id: '1', name: 'AI', type: '@n8n/n8n-nodes-langchain.lmChatOpenAi', parameters: {} }], connections: {} };

  it('folds policy violations into a policy_compliance section', () => {
    const r = scanWorkflow({ workflow: wf, policy: on({ data_handling: { allow_external_ai_models: false } }), policyAuthored: true, workflowVersion: 1, currentVersion: 3 });
    const pc = r.report.policy_compliance;
    expect(pc.status).toBe('violations');
    expect(pc.violations.some((v) => v.type === 'policy_external_model_used')).toBe(true);
    expect(pc.version_drift.drifted).toBe(true);
    expect(pc.version_drift.current_version).toBe(3);
  });

  it('reports "no_policy" honestly when nothing is authored', () => {
    const r = scanWorkflow({ workflow: wf });
    expect(r.report.policy_compliance.status).toBe('no_policy');
    expect(r.report.policy_compliance.violations).toEqual([]);
  });

  it('reports "compliant" when an active policy has no violations', () => {
    const r = scanWorkflow({ workflow: { name: 'x', nodes: [{ id: '1', name: 'noop', type: 'n8n-nodes-base.noOp', parameters: {} }], connections: {} }, policy: on({ credential_policy: { require_org_owned: true } }), policyAuthored: true });
    expect(r.report.policy_compliance.status).toBe('compliant');
  });
});
