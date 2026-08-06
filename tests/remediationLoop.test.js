import { describe, it, expect } from 'vitest';
import { diffScans, detectRegressions, findingKey } from '../lib/services/scanner/reassessment.js';
import { buildRemediationBrief, remediationPromptBlock } from '../lib/services/scanner/remediation.js';
import { normalizePolicy } from '../lib/services/scanner/policy.js';

const F = (type, node = 'N', over = {}) => ({ type, severity: 'medium', title: `${type} title`, node, ...over });

describe('reassessment / before-after (7.3)', () => {
  it('classifies findings as resolved / new / persisting by (type, node)', () => {
    const previous = { readiness_pct: 50, security_risk_level: 'High', findings: [F('missing_error_handling'), F('insecure_http', 'A')] };
    const current = { readiness_pct: 70, security_risk_level: 'Medium', findings: [F('insecure_http', 'A'), F('pii_detected', 'B')] };
    const d = diffScans({ current, previous });
    expect(d.counts).toEqual({ resolved: 1, new: 1, persisting: 1 });
    expect(d.resolved[0].type).toBe('missing_error_handling');
    expect(d.new[0].type).toBe('pii_detected');
    expect(d.readiness_delta).toBe(20);
    expect(d.risk_change).toEqual({ from: 'High', to: 'Medium' });
    expect(d.improved).toBe(true);
  });

  it('handles no-previous gracefully', () => {
    const d = diffScans({ current: { findings: [F('x')] }, previous: null });
    expect(d.has_previous).toBe(false);
    expect(d.counts.new).toBe(1);
  });

  it('detects regressions (resolved finding that reappeared)', () => {
    const findings = [F('insecure_http', 'A'), F('pii_detected', 'B')];
    const resolutions = { [findingKey(F('insecure_http', 'A'))]: { status: 'resolved' }, [findingKey(F('pii_detected', 'B'))]: { status: 'accepted_risk' } };
    const regs = detectRegressions(findings, resolutions);
    expect(regs.map((f) => f.type)).toEqual(['insecure_http']); // accepted_risk is NOT a regression
  });
});

describe('remediation brief (7.1)', () => {
  it('turns addressable findings into concrete directives, honoring policy limits', () => {
    const policy = normalizePolicy({ enabled: true, error_handling: { max_retries: 3 }, approvals: { require_human_approval: true, approval_actions: ['before refunds'] } });
    const brief = buildRemediationBrief({
      findings: [F('missing_error_handling'), F('policy_retry_limit_exceeded'), F('policy_approval_missing', null), F('public_webhook_no_auth', 'hook')],
      policy,
    });
    expect(brief.addressable_types).toEqual(expect.arrayContaining(['missing_error_handling', 'policy_retry_limit_exceeded', 'policy_approval_missing', 'public_webhook_no_auth']));
    expect(brief.directives.join(' ')).toMatch(/at most 3 attempts/);
    expect(brief.directives.join(' ')).toMatch(/before refunds/);
  });

  it('separates advisory (non-regenerable) findings and never promises to fix them', () => {
    const brief = buildRemediationBrief({ findings: [F('pii_detected'), F('special_category_data'), F('third_party_processor')] });
    expect(brief.directives).toHaveLength(0);       // nothing a rebuild can fix
    expect(brief.advisory.map((a) => a.type)).toEqual(expect.arrayContaining(['pii_detected', 'special_category_data']));
  });

  it('dedupes identical directives across many nodes', () => {
    const brief = buildRemediationBrief({ findings: [F('insecure_http', 'A'), F('insecure_http', 'B'), F('insecure_http', 'C')] });
    expect(brief.directives).toHaveLength(1);
  });

  it('remediationPromptBlock is null when there is nothing addressable', () => {
    expect(remediationPromptBlock(buildRemediationBrief({ findings: [F('pii_detected')] }))).toBeNull();
    const block = remediationPromptBlock(buildRemediationBrief({ findings: [F('missing_error_handling')] }));
    expect(block).toMatch(/REMEDIATION REQUIREMENTS/);
    expect(block).toMatch(/error handling/i);
  });
});
