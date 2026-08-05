import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { scanWorkflow } from '../lib/services/scanner/scan.js';

// A REAL Vyrade-generated n8n workflow (19 nodes), redacted of secrets/emails/
// doc-ids and committed so the "verified on real workflows" claim is
// independently reproducible in CI — not just a manual dev-time run.
const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/scanner/vyrade-n8n-export.json', import.meta.url), 'utf8')
);

describe('scanner — real (redacted) Vyrade export fixture', () => {
  it('is a real multi-node workflow', () => {
    expect(Array.isArray(fixture.nodes)).toBe(true);
    expect(fixture.nodes.length).toBeGreaterThanOrEqual(10);
  });

  it('surfaces realistic security + privacy findings on real structure', () => {
    const r = scanWorkflow({ workflow: fixture });
    const types = new Set(r.findings.map((f) => f.type));
    // These are the findings a real spreadsheet→email workflow genuinely has.
    expect(types).toContain('missing_error_handling');
    expect(types).toContain('pii_detected');
    expect(types).toContain('third_party_processor');
    expect(['Medium', 'High']).toContain(r.summary.risk_level);
    expect(r.node_count).toBe(fixture.nodes.length);
  });

  it('the committed fixture is and stays redacted (no secrets)', () => {
    const s = JSON.stringify(fixture);
    for (const secret of [/sk-ant-/, /sk-proj-/, /\bAKIA[0-9A-Z]{16}\b/, /xox[baprs]-/, /-----BEGIN [A-Z ]*PRIVATE KEY/]) {
      expect(s).not.toMatch(secret);
    }
  });
});
