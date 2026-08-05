import { describe, it, expect } from 'vitest';
import { scanWorkflow } from '../lib/services/scanner/scan.js';

const typesOf = (r) => new Set(r.findings.map((f) => f.type));

describe('Privacy analysis (Phase 2)', () => {
  it('2.1 detects PII fields by name and mapping', () => {
    const wf = {
      name: 'Signup', nodes: [
        { id: '1', name: 'Form', type: 'n8n-nodes-base.webhook', parameters: { authentication: 'headerAuth' } },
        { id: '2', name: 'Save', type: 'n8n-nodes-base.googleSheets',
          parameters: { columns: { value: { email: '{{$json.email}}', phone_number: '{{$json.p}}', date_of_birth: '{{$json.dob}}' } } } },
      ], connections: {},
    };
    const r = scanWorkflow({ workflow: wf });
    const pii = r.findings.find((f) => f.type === 'pii_detected');
    expect(pii).toBeTruthy();
    expect(pii.title).toMatch(/email/);
    expect(pii.title).toMatch(/phone/);
    expect(pii.title).toMatch(/date of birth/);
  });

  it('2.2 flags special-category/health data as HIGH', () => {
    const wf = {
      name: 'Health', nodes: [
        { id: '1', name: 'Store', type: 'n8n-nodes-base.postgres', parameters: { columns: { diagnosis: 'x', patient_id: 'y' } } },
      ], connections: {},
    };
    const f = scanWorkflow({ workflow: wf }).findings.find((x) => x.type === 'special_category_data');
    expect(f).toBeTruthy();
    expect(f.severity).toBe('high');
    expect(f.manual_review).toBe(true);
  });

  it('2.3 flags likely over-collection (many fields to an external service) for review', () => {
    const params = { bodyParameters: { parameters: Array.from({ length: 12 }, (_, i) => ({ name: `f${i}`, value: `{{$json.f${i}}}` })) } };
    const wf = { name: 'Bulk', nodes: [{ id: '1', name: 'Send', type: 'n8n-nodes-base.httpRequest', parameters: params }], connections: {} };
    const f = scanWorkflow({ workflow: wf }).findings.find((x) => x.type === 'data_minimisation');
    expect(f).toBeTruthy();
    expect(f.manual_review).toBe(true);
    expect(f.detail).toMatch(/~12 fields/);
  });

  it('2.4 maps a destination to a third-party processor (n8n)', () => {
    const wf = { name: 'Notify', nodes: [{ id: '1', name: 'Slack', type: 'n8n-nodes-base.slack', parameters: {} }], connections: {} };
    const f = scanWorkflow({ workflow: wf }).findings.find((x) => x.type === 'third_party_processor');
    expect(f).toBeTruthy();
    expect(f.title).toMatch(/Slack/);
    expect(f.detail).toMatch(/international transfer|retention/i);
  });

  it('2.4 recognises the SAME processor from Make module identifiers', () => {
    const scenario = { name: 'Make notify', flow: [{ id: 1, module: 'slack:CreateMessage', mapper: { text: 'hi' } }] };
    const f = scanWorkflow({ workflow: scenario, platform: 'make' }).findings.find((x) => x.type === 'third_party_processor');
    expect(f).toBeTruthy();
    expect(f.title).toMatch(/Slack/); // n8n "n8n-nodes-base.slack" and Make "slack:..." → one processor
  });

  it('a clean internal workflow raises no privacy findings', () => {
    const wf = {
      name: 'Cleanup', nodes: [
        { id: '1', name: 'Cron', type: 'n8n-nodes-base.scheduleTrigger', parameters: {} },
        { id: '2', name: 'Set', type: 'n8n-nodes-base.set', parameters: { value: 'ok' } },
      ], connections: {},
    };
    const t = typesOf(scanWorkflow({ workflow: wf }));
    for (const priv of ['pii_detected', 'special_category_data', 'data_minimisation', 'third_party_processor']) {
      expect(t.has(priv)).toBe(false);
    }
  });
});
