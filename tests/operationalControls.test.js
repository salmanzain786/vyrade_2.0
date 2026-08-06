import { describe, it, expect } from 'vitest';
import { assessOperationalControls } from '../lib/services/scanner/operationalControls.js';
import { scanWorkflow } from '../lib/services/scanner/scan.js';

const bare = { human_approval: { required: null, approval_points: [] }, exception_rules: [], notification_rules: [] };
const governed = {
  human_approval: { required: true, approval_points: ['before send'] },
  exception_rules: [{ exception_id: 'e1', scenario: 'API down', behavior: 'notify ops and retry manually', data_changes: null }],
  notification_rules: [{ channel_system: 'Slack', condition: 'on failure', event: 'error', audience: 'ops' }],
};

describe('operational controls (Phase 3)', () => {
  it('flags every missing control on a bare Blueprint (no owner, single version)', () => {
    const t = new Set(assessOperationalControls({ blueprint: bare, versionCount: 1, owner: null }).map((f) => f.type));
    expect(t).toContain('no_owner_assigned');       // 3.1
    expect(t).toContain('approval_unspecified');    // 3.1
    expect(t).toContain('no_exception_handling');   // 3.2
    expect(t).toContain('no_incident_notification');// 3.2
    expect(t).toContain('no_version_iteration');    // 3.3
  });

  it('passes a fully-governed Blueprint with an owner + version history', () => {
    expect(assessOperationalControls({ blueprint: governed, versionCount: 3, owner: 'a@b.com' })).toHaveLength(0);
  });

  it('an assigned owner + version history suppress those two checks', () => {
    const t = new Set(assessOperationalControls({ blueprint: bare, versionCount: 2, owner: 'a@b.com' }).map((f) => f.type));
    expect(t).not.toContain('no_owner_assigned');
    expect(t).not.toContain('no_version_iteration');
    expect(t).toContain('no_exception_handling'); // still missing
  });

  it('all Phase 3 findings are manual-review (governance, not automatic pass/fail)', () => {
    for (const f of assessOperationalControls({ blueprint: bare, versionCount: 1, owner: null })) {
      expect(f.manual_review).toBe(true);
    }
  });

  it('scanWorkflow merges operational-controls findings when Blueprint context is passed', () => {
    const wf = { name: 'x', nodes: [{ id: '1', name: 'H', type: 'n8n-nodes-base.webhook', parameters: { authentication: 'headerAuth' } }], connections: {} };
    const t = new Set(scanWorkflow({ workflow: wf, blueprint: bare, versionCount: 1, owner: null }).findings.map((f) => f.type));
    expect(t).toContain('no_exception_handling'); // Phase 3 alongside the workflow scan
  });

  it('scanWorkflow with NO Blueprint context runs no operational-controls checks', () => {
    const wf = { name: 'x', nodes: [{ id: '1', name: 'S', type: 'n8n-nodes-base.set', parameters: {} }], connections: {} };
    const t = new Set(scanWorkflow({ workflow: wf }).findings.map((f) => f.type));
    expect(t).not.toContain('no_owner_assigned');
    expect(t).not.toContain('no_exception_handling');
  });
});
