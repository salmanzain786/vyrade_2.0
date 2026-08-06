import { describe, it, expect } from 'vitest';
import { mapFrameworks, FRAMEWORK_DISCLAIMER } from '../lib/services/scanner/frameworks.js';
import { scanWorkflow } from '../lib/services/scanner/scan.js';

const findings = [
  { type: 'pii_detected', severity: 'medium', title: 'PII handled' },
  { type: 'insecure_http', severity: 'medium', title: 'Insecure http' },
  { type: 'special_category_data', severity: 'high', title: 'Health data' },
  { type: 'third_party_processor', severity: 'low', title: 'Slack' },
];
const gdprOf = (fs) => mapFrameworks(fs).frameworks.find((f) => f.framework === 'GDPR');
const area = (fw, name) => fw.areas.find((a) => a.area.startsWith(name));

describe('framework mapping (Phase 4)', () => {
  it('carries the "gap assessment, not certification" disclaimer', () => {
    expect(mapFrameworks(findings).disclaimer).toMatch(/not a compliance certification/i);
    expect(FRAMEWORK_DISCLAIMER).toMatch(/gap assessment/i);
  });

  it('carries a pending legal-review status until a reviewer signs off', () => {
    const r = mapFrameworks(findings);
    expect(r.review.status).toBe('unreviewed');
    expect(r.review.warning).toMatch(/not yet been reviewed by a compliance/i);
  });

  it('produces GDPR, HIPAA and SOC 2, each with an area table', () => {
    const r = mapFrameworks(findings);
    expect(r.frameworks.map((f) => f.framework)).toEqual(['GDPR', 'HIPAA', 'SOC 2']);
    for (const fw of r.frameworks) expect(fw.areas.length).toBeGreaterThan(5);
  });

  it('maps areas to Potential gap / No gaps / Not assessed', () => {
    const g = gdprOf(findings);
    expect(area(g, 'Personal-data processing').status).toBe('Potential gap'); // pii + special
    expect(area(g, 'Security of processing').status).toBe('Potential gap');    // insecure_http
    expect(area(g, 'Data minimisation').status).toBe('No gaps detected');      // no such finding
    expect(area(g, 'Data-subject rights').status).toBe('Not assessed');        // DSAR = Phase 6
  });

  it('area severity reflects the worst mapped finding', () => {
    const lawful = area(gdprOf(findings), 'Lawful basis');
    expect(lawful.severity).toBe('high'); // special_category_data
    expect(lawful.finding_types).toContain('special_category_data');
  });

  it('empty findings → no gap areas, DSAR still Not assessed (not "certified")', () => {
    const g = gdprOf([]);
    expect(g.gap_areas).toBe(0);
    expect(g.areas.some((a) => a.status === 'Not assessed')).toBe(true);
    expect(g.areas.every((a) => a.status !== 'Compliant')).toBe(true); // never claims compliance
  });

  it('scanWorkflow output includes framework_mapping', () => {
    const wf = { name: 'x', nodes: [{ id: '1', name: 'H', type: 'n8n-nodes-base.webhook', parameters: { authentication: 'none' } }], connections: {} };
    const r = scanWorkflow({ workflow: wf });
    expect(r.framework_mapping.frameworks.length).toBe(3);
    // public_webhook_no_auth lands in GDPR security, HIPAA access, SOC 2 access
    expect(area(gdprOf(r.findings), 'Security of processing').status).toBe('Potential gap');
  });
});
