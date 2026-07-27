import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  slugify, normalizeTool, noToolResult, aggregateToolRisk, AUTH_METHODS,
} from '../lib/services/tools/toolIntelligence.js';

describe('toolIntelligence — pure helpers', () => {
  it('slugifies tool names to match workflow integrations', () => {
    expect(slugify('Google Sheets')).toBe('googlesheets');
    expect(slugify('HubSpot')).toBe('hubspot');
  });

  it('normalizes a DB row (tinyint → bool, JSON → array)', () => {
    const t = normalizeTool({
      tool_name: 'Slack', slug: 'slack', category: 'communication',
      api_available: 1, mcp_available: 0, auth_method: 'oauth2',
      use_cases: JSON.stringify(['Notifications']), integration_complexity: 'low', security_risk: 'low',
    });
    expect(t.api_available).toBe(true);
    expect(t.mcp_available).toBe(false);
    expect(t.use_cases).toEqual(['Notifications']);
    expect(t.auth_method).toBe('oauth2');
  });

  it('noToolResult is honest, not fabricated', () => {
    const r = noToolResult('Segment');
    expect(r.found).toBe(false);
    expect(r.auth_method).toBe('unknown');
    expect(r.reason).toMatch(/No tool-intelligence record for 'Segment'/);
  });

  it('every seeded auth method is a valid enum value', () => {
    for (const m of ['oauth2', 'bearer', 'api_key', 'basic', 'token', 'none', 'unknown']) {
      expect(AUTH_METHODS.has(m)).toBe(true);
    }
  });
});

describe('aggregateToolRisk — the signal for recommendation + packages', () => {
  it('takes the MAX risk/complexity and lists gaps', () => {
    const summary = aggregateToolRisk([
      { found: true, tool_name: 'Slack', security_risk: 'low', integration_complexity: 'low', mcp_available: false },
      { found: true, tool_name: 'Stripe', security_risk: 'high', integration_complexity: 'medium', mcp_available: false },
      { found: false, tool_name: 'Weird API' },
    ]);
    expect(summary.max_security_risk).toBe('high');       // Stripe dominates
    expect(summary.max_integration_complexity).toBe('medium');
    expect(summary.known_tools).toBe(2);
    expect(summary.unresolved_tools).toContain('Weird API');
    expect(summary.mcp_unavailable).toEqual(expect.arrayContaining(['Slack', 'Stripe']));
  });
});

// ── Repository (mocked pool + pricing composition) ──────────────────────────
const query = vi.fn();
vi.mock('../lib/config/db.js', () => ({ pool: { query: (...a) => query(...a) } }));
vi.mock('../lib/services/cost/connectorProfileRepository.js', () => ({
  resolveConnector: vi.fn(async () => ({ found: true, pricing_model: 'workspace_plan', unit_price: null, requires_paid_plan: false, confidence: 'medium' })),
}));
const repo = await import('../lib/services/tools/toolIntelligenceRepository.js');

describe('toolIntelligenceRepository (mocked pool)', () => {
  beforeEach(() => query.mockReset());

  it('resolveTool composes intelligence + pricing when a record exists', async () => {
    query.mockResolvedValueOnce([[{ tool_name: 'Slack', slug: 'slack', auth_method: 'oauth2', api_available: 1, mcp_available: 0, integration_complexity: 'low', security_risk: 'low' }]]);
    const r = await repo.resolveTool('Slack', { platform: 'zapier' });
    expect(r.found).toBe(true);
    expect(r.auth_method).toBe('oauth2');
    expect(r.pricing.pricing_model).toBe('workspace_plan');   // composed from cost registry
  });

  it('resolveTool returns the honest not-found when no record', async () => {
    query.mockResolvedValueOnce([[]]);
    const r = await repo.resolveTool('Segment');
    expect(r).toMatchObject({ found: false, auth_method: 'unknown' });
  });

  it('upsert rejects an invalid auth_method', async () => {
    await expect(repo.upsertTool({ toolName: 'X', authMethod: 'magic' })).rejects.toThrow(/invalid auth_method/);
    expect(query).not.toHaveBeenCalled();
  });

  it('resolveTools returns a fleet summary', async () => {
    query
      .mockResolvedValueOnce([[{ tool_name: 'Stripe', auth_method: 'bearer', security_risk: 'high', integration_complexity: 'medium', mcp_available: 0 }]])
      .mockResolvedValueOnce([[]]); // second tool unknown
    const { summary } = await repo.resolveTools(['Stripe', 'Unknown Co']);
    expect(summary.max_security_risk).toBe('high');
    expect(summary.unresolved_tools).toContain('Unknown Co');
  });
});
