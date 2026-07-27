import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OPS_EVENTS, errorCategoryFromN8n, parseFailingNode } from '../lib/services/insights/operationalInsights.js';

describe('n8n error parsing', () => {
  it('categorizes common n8n import errors', () => {
    expect(errorCategoryFromN8n('nodes/0 must have required property "typeVersion"')).toBe('missing_typeversion');
    expect(errorCategoryFromN8n('nodes/1 has an unknown node type')).toBe('unknown_node_type');
    expect(errorCategoryFromN8n('connections reference a missing node')).toBe('invalid_connections');
    expect(errorCategoryFromN8n('request timed out')).toBe('unreachable');
    expect(errorCategoryFromN8n('')).toBe('unknown');
  });

  it('identifies the failing node by index', () => {
    const nodes = [
      { type: 'n8n-nodes-base.webhook' },
      { type: 'n8n-nodes-base.slack' },
      { type: '@n8n/n8n-nodes-langchain.agent' },
    ];
    expect(parseFailingNode('request/body/nodes/1 must have required property "typeVersion"', nodes)).toBe('slack');
    expect(parseFailingNode('request/body/nodes/2 is invalid', nodes)).toBe('langchain.agent');
  });

  it('identifies the failing node by explicit type in the message', () => {
    expect(parseFailingNode('unknown node type: n8n-nodes-base.foobar', [])).toBe('foobar');
  });

  it('returns null when no node can be attributed', () => {
    expect(parseFailingNode('generic error', [{ type: 'n8n-nodes-base.slack' }])).toBeNull();
  });
});

// ── Repository (mocked pool) ────────────────────────────────────────────────
const query = vi.fn(async () => [[]]);
vi.mock('../lib/config/db.js', () => ({ pool: { query: (...a) => query(...a) } }));
const repo = await import('../lib/services/insights/operationalInsightsRepository.js');

describe('recordEvent — fire-and-forget, safe', () => {
  beforeEach(() => query.mockReset().mockResolvedValue([[]]));

  it('inserts an event with the right columns', () => {
    repo.recordEvent({
      eventType: OPS_EVENTS.IMPORT_FAILED, platform: 'n8n', blueprintId: 'bp1',
      userId: 'u1', nodeType: 'slack', errorCategory: 'unknown_node_type', severity: 'error',
    });
    expect(query).toHaveBeenCalledTimes(1);
    const [sqlText, params] = query.mock.calls[0];
    expect(sqlText).toMatch(/INSERT INTO operational_events/);
    expect(params[0]).toBe('import_failed');
    expect(params).toContain('slack');
    expect(params).toContain('unknown_node_type');
  });

  it('does nothing without an eventType', () => {
    repo.recordEvent({});
    expect(query).not.toHaveBeenCalled();
  });

  it('never throws even if the DB rejects', async () => {
    query.mockRejectedValueOnce(new Error('db down'));
    expect(() => repo.recordEvent({ eventType: 'x' })).not.toThrow();
  });

  it('metadata drops nested objects (no payload leakage)', () => {
    repo.recordEvent({ eventType: 'workflow_generated', metadata: { import_check: 'failed', blob: { secret: 'x' } } });
    const meta = JSON.parse(query.mock.calls[0][1][11]);
    expect(meta.import_check).toBe('failed');
    expect(meta.blob).toBeUndefined();   // nested object dropped
  });
});

describe('aggregations', () => {
  beforeEach(() => query.mockReset());

  it('topFailingNodes maps rows', async () => {
    query.mockResolvedValueOnce([[{ node_type: 'slack', failures: 5, last_seen: '2026-07-27' }]]);
    const r = await repo.topFailingNodes({ days: 30 });
    expect(r[0]).toMatchObject({ node_type: 'slack', failures: 5 });
  });

  it('importOutcomes computes a failure rate', async () => {
    query.mockResolvedValueOnce([[
      { event_type: 'workflow_generated', c: 100 },
      { event_type: 'import_failed', c: 8 },
    ]]);
    const r = await repo.importOutcomes({ days: 30 });
    expect(r.generated).toBe(100);
    expect(r.failure_rate).toBeCloseTo(0.08, 5);
  });
});
