import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
vi.mock('../lib/config/db.js', () => ({ pool: { query: (...a) => query(...a) } }));
const { governanceRollup } = await import('../lib/services/admin/adminGovernanceRepository.js');

const scanRow = (over = {}) => ({
  blueprint_id: 'bp1', readiness_pct: 70, security_risk_level: 'High', findings_total: 5,
  findings_json: '[]', created_at: new Date(), user_id: 'u1', owner_email: 'a@b.com', name: 'BP', ...over,
});

describe('governanceRollup (8.2)', () => {
  beforeEach(() => query.mockReset());

  it('aggregates risk rows from the latest scan per blueprint', async () => {
    query
      .mockResolvedValueOnce([[
        scanRow({ blueprint_id: 'b1', name: 'Owned', owner_email: 'a@b.com', findings_json: JSON.stringify([{ type: 'pii_detected' }]) }),
        scanRow({ blueprint_id: 'b2', name: 'Ownerless', owner_email: null, readiness_pct: 40, findings_json: JSON.stringify([{ type: 'workflow_version_drift' }, { type: 'policy_approval_missing' }]) }),
      ]])
      .mockResolvedValueOnce([[{ total_blueprints: 5 }]]);

    const g = await governanceRollup();
    expect(g.scanned).toBe(2);
    expect(g.unscanned).toBe(3);                     // 5 total - 2 scanned
    expect(g.avg_readiness).toBe(55);                // (70 + 40) / 2
    expect(g.risk.High).toBe(2);
    expect(g.risk_items.no_owner.count).toBe(1);     // b2 has no owner
    expect(g.risk_items.no_owner.blueprints[0].name).toBe('Ownerless');
    expect(g.risk_items.sensitive_data.count).toBe(1); // b1 pii
    expect(g.risk_items.missing_approvals.count).toBe(1); // b2
    expect(g.risk_items.outdated_outputs.count).toBe(1);  // b2 drift
  });

  it('worst list is sorted by readiness ascending', async () => {
    query
      .mockResolvedValueOnce([[
        scanRow({ blueprint_id: 'hi', readiness_pct: 90 }),
        scanRow({ blueprint_id: 'lo', readiness_pct: 20 }),
      ]])
      .mockResolvedValueOnce([[{ total_blueprints: 2 }]]);
    const g = await governanceRollup();
    expect(g.worst[0].id).toBe('lo');
    expect(g.worst[1].id).toBe('hi');
  });

  it('is honest about what it cannot compute (no faked rows)', async () => {
    query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ total_blueprints: 0 }]]);
    const g = await governanceRollup();
    expect(g.scanned).toBe(0);
    expect(g.avg_readiness).toBeNull();
    expect(g.unavailable.department_rollup).toMatch(/org\/department model/i);
    expect(g.unavailable.duplicate_platforms).toMatch(/taxonomy/i);
  });
});
