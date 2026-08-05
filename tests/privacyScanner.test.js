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

  it('2.5 flags a marketing/SMS send with no visible consent gate (review)', () => {
    const wf = {
      name: 'SMS blast', nodes: [
        { id: '1', name: 'Trigger', type: 'n8n-nodes-base.scheduleTrigger', parameters: {} },
        { id: '2', name: 'Send SMS', type: 'n8n-nodes-base.twilio', parameters: { operation: 'send', message: 'Buy now!' } },
      ], connections: {},
    };
    const f = scanWorkflow({ workflow: wf }).findings.find((x) => x.type === 'consent_dependent_action');
    expect(f).toBeTruthy();
    expect(f.severity).toBe('medium');
    expect(f.manual_review).toBe(true);
  });

  it('2.5 does NOT flag when a consent/opt-in gate is present', () => {
    const wf = {
      name: 'SMS with consent', nodes: [
        { id: '1', name: 'Only if opted-in', type: 'n8n-nodes-base.if', parameters: { conditions: { conditions: [{ leftValue: '{{$json.marketing_consent}}', operator: 'equals', rightValue: true }] } } },
        { id: '2', name: 'Send SMS', type: 'n8n-nodes-base.twilio', parameters: { message: 'Hi' } },
      ], connections: {},
    };
    expect(scanWorkflow({ workflow: wf }).findings.map((x) => x.type)).not.toContain('consent_dependent_action');
  });

  it('2.5 does NOT flag a transactional email (gmail) — not a consent-relevant channel', () => {
    const wf = { name: 'Reset', nodes: [{ id: '1', name: 'Email', type: 'n8n-nodes-base.gmail', parameters: { operation: 'send' } }], connections: {} };
    expect(scanWorkflow({ workflow: wf }).findings.map((x) => x.type)).not.toContain('consent_dependent_action');
  });

  it('2.6 flags PII written to a log/audit sink at elevated (High) severity', () => {
    const wf = {
      name: 'Audit', nodes: [
        { id: '1', name: 'Append to Audit Log', type: 'n8n-nodes-base.googleSheets',
          parameters: { columns: { value: { user_email: '{{$json.email}}', action: 'login' } } } },
      ], connections: {},
    };
    const f = scanWorkflow({ workflow: wf }).findings.find((x) => x.type === 'sensitive_logging');
    expect(f).toBeTruthy();
    expect(f.severity).toBe('high');
  });

  it('2.6 flags special-category data to a logging service as Critical', () => {
    const wf = {
      name: 'Obs', nodes: [
        { id: '1', name: 'Datadog', type: 'n8n-nodes-base.datadog', parameters: { message: '{{$json.diagnosis}}' } },
      ], connections: {},
    };
    const f = scanWorkflow({ workflow: wf }).findings.find((x) => x.type === 'sensitive_logging');
    expect(f).toBeTruthy();
    expect(f.severity).toBe('critical');
  });

  it('2.6 does NOT flag sensitive logging for a non-log PII destination', () => {
    const wf = {
      name: 'CRM', nodes: [
        { id: '1', name: 'Create contact', type: 'n8n-nodes-base.hubspot', parameters: { email: '{{$json.email}}' } },
      ], connections: {},
    };
    const types = scanWorkflow({ workflow: wf }).findings.map((x) => x.type);
    expect(types).toContain('pii_detected');           // still flagged as PII handling
    expect(types).not.toContain('sensitive_logging');  // but not as a logging risk
  });

  it('2.7 flags PII stored with no visible deletion/expiry (review)', () => {
    const wf = {
      name: 'Store leads', nodes: [
        { id: '1', name: 'Save contact', type: 'n8n-nodes-base.postgres',
          parameters: { operation: 'insert', columns: { email: '{{$json.email}}', name: '{{$json.name}}' } } },
      ], connections: {},
    };
    const f = scanWorkflow({ workflow: wf }).findings.find((x) => x.type === 'no_retention_control');
    expect(f).toBeTruthy();
    expect(f.manual_review).toBe(true);
  });

  it('2.7 does NOT flag when a deletion/cleanup mechanism exists', () => {
    const wf = {
      name: 'Store + cleanup', nodes: [
        { id: '1', name: 'Save', type: 'n8n-nodes-base.postgres', parameters: { operation: 'insert', columns: { email: '{{$json.email}}' } } },
        { id: '2', name: 'Purge old rows', type: 'n8n-nodes-base.postgres', parameters: { operation: 'delete' } },
      ], connections: {},
    };
    expect(scanWorkflow({ workflow: wf }).findings.map((x) => x.type)).not.toContain('no_retention_control');
  });

  it('2.7 does NOT flag a store write with no personal data (gated on PII)', () => {
    const wf = {
      name: 'Metrics', nodes: [
        { id: '1', name: 'Save metric', type: 'n8n-nodes-base.postgres', parameters: { operation: 'insert', columns: { metric: 'count', value: 5 } } },
      ], connections: {},
    };
    expect(scanWorkflow({ workflow: wf }).findings.map((x) => x.type)).not.toContain('no_retention_control');
  });

  it('2.7 does NOT flag a read-only store access', () => {
    const wf = {
      name: 'Lookup', nodes: [
        { id: '1', name: 'Get contact', type: 'n8n-nodes-base.postgres', parameters: { operation: 'select', columns: { email: '{{$json.email}}' } } },
      ], connections: {},
    };
    expect(scanWorkflow({ workflow: wf }).findings.map((x) => x.type)).not.toContain('no_retention_control');
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
