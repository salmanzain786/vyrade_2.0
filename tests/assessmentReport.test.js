import { describe, it, expect } from 'vitest';
import { generateAssessmentReport } from '../lib/services/scanner/report.js';
import { mapFrameworks } from '../lib/services/scanner/frameworks.js';
import { scanWorkflow } from '../lib/services/scanner/scan.js';

const build = (findings, opts = {}) =>
  generateAssessmentReport({ findings, framework_mapping: mapFrameworks(findings), platform: 'n8n', node_count: 5, ...opts });

const F = (type, severity, over = {}) => ({ type, severity, title: `${type} title`, detail: 'd', node: 'N', remediation: `fix ${type}`, manual_review: false, ...over });

describe('assessment report (Phase 5)', () => {
  it('5.1 clean scan → high readiness, Low security risk', () => {
    const r = build([]);
    expect(r.overall.governance_readiness_pct).toBe(100);
    expect(r.overall.readiness_band).toBe('Strong');
    expect(r.overall.security_risk_level).toBe('Low');
    expect(r.overall.caveat).toMatch(/not a .*certification/i);
  });

  it('5.1 readiness drops with severity, and stays directional (never negative)', () => {
    const r = build([F('hardcoded_credential', 'critical'), F('special_category_data', 'high'), F('pii_detected', 'medium')]);
    expect(r.overall.governance_readiness_pct).toBeLessThan(100);
    expect(r.overall.governance_readiness_pct).toBeGreaterThanOrEqual(0);
    expect(r.overall.security_risk_level).toBe('High');
  });

  it('5.1 framework alignment reflects the mapping', () => {
    const r = build([F('pii_detected', 'medium')]);
    const gdpr = r.overall.framework_alignment.find((f) => f.framework === 'GDPR');
    expect(gdpr.status).toBe('Gaps identified');
    expect(gdpr.gap_areas).toBeGreaterThan(0);
  });

  it('5.2 critical/high sections are severity-tiered', () => {
    const r = build([F('hardcoded_credential', 'critical'), F('public_webhook_no_auth', 'high'), F('pii_detected', 'medium')]);
    expect(r.priority_findings.critical.map((f) => f.type)).toContain('hardcoded_credential');
    expect(r.priority_findings.high.map((f) => f.type)).toContain('public_webhook_no_auth');
    // medium is not in the priority sections
    expect([...r.priority_findings.critical, ...r.priority_findings.high].map((f) => f.type)).not.toContain('pii_detected');
  });

  it('5.3 remediations aggregate by type, prioritised, with a Phase 6 hint for governance', () => {
    const r = build([F('insecure_http', 'medium', { node: 'A' }), F('insecure_http', 'medium', { node: 'B' }), F('no_owner_assigned', 'medium', { node: null })]);
    const http = r.remediations.find((x) => x.type === 'insecure_http');
    expect(http.count).toBe(2);
    expect(http.nodes.sort()).toEqual(['A', 'B']);
    expect(http.recommendation).toMatch(/fix insecure_http/);
    const gov = r.remediations.find((x) => x.type === 'no_owner_assigned');
    expect(gov.blueprint_hint).toMatch(/Phase 6/);
  });

  it('5.4 evidence & limitations is honest about what was and was not assessed', () => {
    const r = build([F('pii_detected', 'medium', { manual_review: false }), F('third_party_processor', 'low', { manual_review: true })], { blueprintAssessed: false });
    const e = r.evidence_and_limitations;
    expect(e.detected_from_workflow.check_families.length).toBeGreaterThan(5);
    expect(e.from_blueprint.assessed).toBe(false);           // no blueprint context
    expect(e.from_blueprint.note).toMatch(/were NOT assessed/);
    expect(e.out_of_scope.length).toBeGreaterThan(3);
    expect(e.manual_review_items).toBe(1);
    expect(e.framework_mappings_reviewed).toBe(false);       // pending legal review
    expect(e.not_assessed.some((s) => /DSAR|Phase 6/.test(s))).toBe(true);
  });

  it('5.4 records Blueprint assessment when context was provided', () => {
    const e = build([F('no_exception_handling', 'medium')], { blueprintAssessed: true }).evidence_and_limitations;
    expect(e.from_blueprint.assessed).toBe(true);
    expect(e.from_blueprint.check_families).toContain('Recovery process');
  });

  it('scanWorkflow output includes the report', () => {
    const wf = { name: 'x', nodes: [{ id: '1', name: 'H', type: 'n8n-nodes-base.webhook', parameters: { authentication: 'none' } }], connections: {} };
    const r = scanWorkflow({ workflow: wf });
    expect(r.report.overall.security_risk_level).toBe('High'); // public_webhook_no_auth
    expect(r.report.evidence_and_limitations.from_blueprint.assessed).toBe(false);
  });
});
