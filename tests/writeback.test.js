import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deriveLifecycleStage, LIFECYCLE_STAGES } from '../lib/services/work-intelligence/writeback/lifecycle.js';

describe('lifecycle stage derivation (4.2)', () => {
  it('a fresh Blueprint is at clarification_required', () => {
    expect(deriveLifecycleStage({ blueprintStatus: 'collecting_requirements' }).key).toBe('clarification_required');
  });
  it('advances through the spec stages as state accrues', () => {
    expect(deriveLifecycleStage({ blueprintStatus: 'requirements_complete' }).key).toBe('requirements_complete');
    expect(deriveLifecycleStage({ blueprintStatus: 'requirements_complete', hasRecommendation: true, hasCost: true }).key).toBe('cost_model_ready');
    expect(deriveLifecycleStage({ blueprintStatus: 'requirements_complete', hasWorkflow: true }).key).toBe('implementation_prepared');
    expect(deriveLifecycleStage({ blueprintStatus: 'requirements_complete', hasWorkflow: true, govScanned: true }).key).toBe('security_assessment');
    expect(deriveLifecycleStage({ implemented: true }).key).toBe('deployment_approval');
    expect(deriveLifecycleStage({ active: true }).key).toBe('workflow_active');
    expect(deriveLifecycleStage({ measured: true }).key).toBe('outcome_review');
  });
  it('reports the full stage list with a done flag up to the current stage', () => {
    const d = deriveLifecycleStage({ hasWorkflow: true });
    expect(d.stages).toHaveLength(LIFECYCLE_STAGES.length);
    expect(d.stages.filter((s) => s.done).length).toBe(d.index + 1);
  });
});

// Write-back gating (4.1) — mock the DB + connector.
const query = vi.fn();
vi.mock('../lib/config/db.js', () => ({ pool: { query: (...a) => query(...a) } }));
const getConnection = vi.fn();
const accessTokenOf = vi.fn(() => 'tok');
vi.mock('../lib/services/work-intelligence/connectionRepository.js', () => ({ getConnection: (...a) => getConnection(...a), accessTokenOf: (...a) => accessTokenOf(...a) }));
const postComment = vi.fn(async () => ({ id: 'c1', url: 'https://app.clickup.com/t/T1' }));
vi.mock('../lib/services/work-intelligence/connectors/registry.js', () => ({ getConnector: () => ({ platform: 'clickup', supportsWriteback: true, postComment: (...a) => postComment(...a) }) }));

const { syncBlueprintProgress } = await import('../lib/services/work-intelligence/writeback/sync.js');

// State-gather queries fire in fixed order: link, then (blueprint status, wf, gov, impl), then recordSync.
const linkRow = (over = {}) => [[{ blueprint_id: 'bp1', connection_id: 'c1', external_task_id: 'T1', last_stage: null, ...over }]];
const bpState = () => query
  .mockResolvedValueOnce([[{ status: 'requirements_complete' }]]) // blueprint status
  .mockResolvedValueOnce([[{ n: 1 }]])                            // workflow
  .mockResolvedValueOnce([[{ n: 0 }]])                            // gov
  .mockResolvedValueOnce([[{}]]);                                 // impl

describe('write-back permission gating (4.1)', () => {
  beforeEach(() => { query.mockReset(); getConnection.mockReset(); postComment.mockClear(); });

  it('REFUSES to write when write_back_enabled is false — read never implies write', async () => {
    query.mockResolvedValueOnce(linkRow());
    getConnection.mockResolvedValue({ status: 'active', platform: 'clickup', scope: { write_back_enabled: false }, _enc: {} });
    const r = await syncBlueprintProgress({ userId: 'u1', blueprintId: 'bp1' });
    expect(r).toMatchObject({ ok: false, reason: 'write_back_disabled', wrote: false });
    expect(postComment).not.toHaveBeenCalled();
  });

  it('writes the current stage when write-back IS enabled', async () => {
    query.mockResolvedValueOnce(linkRow());
    getConnection.mockResolvedValue({ status: 'active', platform: 'clickup', scope: { write_back_enabled: true }, _enc: { access: 'x' } });
    bpState();
    query.mockResolvedValueOnce([{}]); // recordSync
    const r = await syncBlueprintProgress({ userId: 'u1', blueprintId: 'bp1', appOrigin: 'https://vyrade.app' });
    expect(r.ok).toBe(true);
    expect(r.wrote).toBe(true);
    expect(postComment).toHaveBeenCalledOnce();
    expect(postComment.mock.calls[0][2]).toMatch(/vyrade\.app\/report\/bp1/); // the back-link
  });

  it('is idempotent — no write when the stage is unchanged', async () => {
    // bpState() → requirements_complete + a workflow → implementation_prepared.
    query.mockResolvedValueOnce(linkRow({ last_stage: 'implementation_prepared' })); // already at this stage
    getConnection.mockResolvedValue({ status: 'active', platform: 'clickup', scope: { write_back_enabled: true }, _enc: { access: 'x' } });
    bpState();
    const r = await syncBlueprintProgress({ userId: 'u1', blueprintId: 'bp1' });
    expect(r).toMatchObject({ ok: true, wrote: false });
    expect(postComment).not.toHaveBeenCalled();
  });

  it('reports not-linked for a Blueprint with no originating task', async () => {
    query.mockResolvedValueOnce([[]]); // no link
    const r = await syncBlueprintProgress({ userId: 'u1', blueprintId: 'bp1' });
    expect(r).toMatchObject({ ok: false, reason: 'not_task_linked' });
  });
});
