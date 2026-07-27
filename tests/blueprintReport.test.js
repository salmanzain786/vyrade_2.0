import { describe, it, expect, vi } from 'vitest';
import { baseBlueprint } from './fixtures.js';

// Mock the two DB-backed dependencies; the recommendation engine stays real.
vi.mock('../lib/services/cost/costComparison.js', () => ({
  buildCostComparison: vi.fn(async () => ({
    monthly_volume: 3000, volume_assumed: false,
    platforms: [
      { platform: 'n8n', platform_name: 'n8n', known_monthly_cost: 0, estimated_total: null, currency: 'USD', confidence: 'low', cost_groups: { platform: { known: 0 } }, estimated_units: { execution: 3000 } },
      { platform: 'zapier', platform_name: 'Zapier', known_monthly_cost: 86.4, estimated_total: 86.4, currency: 'USD', confidence: 'medium', cost_groups: { platform: { known: 86.4 } }, estimated_units: { task: 3000 } },
    ],
    tradeoffs: [{ platform: 'n8n', platform_name: 'n8n', summary: 'n8n has lower metered cost, higher hosting responsibility.' }],
  })),
}));
vi.mock('../lib/services/tools/toolIntelligenceRepository.js', () => ({
  resolveTools: vi.fn(async (names) => ({
    tools: (names || []).map((n) => ({
      tool_name: n, found: n === 'HubSpot' || n === 'Slack',
      auth_method: n === 'HubSpot' ? 'oauth2' : 'oauth2',
      integration_complexity: n === 'HubSpot' ? 'medium' : 'low',
      security_risk: n === 'HubSpot' ? 'high' : 'low',
      documentation_url: 'https://x/docs',
    })),
    summary: { max_security_risk: 'high', max_integration_complexity: 'medium', known_tools: 2, unresolved_tools: ['Website'], mcp_unavailable: ['HubSpot', 'Slack'] },
  })),
}));

const { generateBlueprintReport } = await import('../lib/services/report/blueprintReport.js');

const SECTIONS = [
  'business_problem', 'current_process', 'automation_blueprint', 'systems',
  'business_rules', 'risk_areas', 'recommended_architecture', 'cost_comparison',
  'implementation_roadmap', 'human_approval_points', 'security_notes', 'next_steps',
];

describe('generateBlueprintReport — the customer deliverable', () => {
  it('assembles every required section', async () => {
    const report = await generateBlueprintReport({ blueprint: baseBlueprint(), blueprintId: 'bp_1', blueprintVersion: 3 });
    for (const key of SECTIONS) expect(report.sections).toHaveProperty(key);
    expect(report.title).toMatch(/Automation Blueprint/);
    expect(['unknown', 'low', 'medium', 'high']).toContain(report.confidence);
  });

  it('states the business problem from the intent', async () => {
    const report = await generateBlueprintReport({ blueprint: baseBlueprint() });
    expect(report.sections.business_problem.summary.toLowerCase()).toContain('lead');
  });

  it('lists the current manual process steps', async () => {
    const report = await generateBlueprintReport({ blueprint: baseBlueprint() });
    expect(report.sections.current_process.steps.length).toBeGreaterThan(0);
    expect(report.sections.current_process.note).toMatch(/manually/i);
  });

  it('enriches systems with auth / complexity / security from tool intelligence', async () => {
    const report = await generateBlueprintReport({ blueprint: baseBlueprint() });
    const hubspot = report.sections.systems.find((s) => s.name === 'HubSpot');
    expect(hubspot.auth_method).toBe('oauth2');
    expect(hubspot.security_risk).toBe('high');
  });

  it('derives risk areas including high-sensitivity data + unverified tools', async () => {
    const report = await generateBlueprintReport({ blueprint: baseBlueprint() });
    const areas = report.sections.risk_areas.map((r) => r.area).join(' | ');
    expect(areas).toMatch(/Sensitive data handling/);
    expect(areas).toMatch(/Unverified integrations/);
  });

  it('recommends an architecture with a reason', async () => {
    const report = await generateBlueprintReport({ blueprint: baseBlueprint() });
    expect(report.sections.recommended_architecture.name).toBeTruthy();
    expect(report.sections.recommended_architecture.reason).toBeTruthy();
  });

  it('includes a cost comparison across platforms', async () => {
    const report = await generateBlueprintReport({ blueprint: baseBlueprint() });
    expect(report.sections.cost_comparison.platforms.length).toBeGreaterThanOrEqual(2);
  });

  it('builds an implementation roadmap ending in testing + deploy', async () => {
    const report = await generateBlueprintReport({ blueprint: baseBlueprint() });
    const titles = report.sections.implementation_roadmap.map((p) => p.title);
    expect(titles[0]).toMatch(/Foundations/);
    expect(titles.join(' ')).toMatch(/Testing/);
    expect(titles.join(' ')).toMatch(/Deploy/);
  });

  it('adds an AI phase + approval phase when the Blueprint calls for them', async () => {
    const bp = baseBlueprint({
      human_approval: { required: true, approval_points: ['Manager approves refunds'] },
      process_steps: [
        { step_id: 's1', sequence: 1, action: 'Receive', action_type: 'receive_data' },
        { step_id: 's2', sequence: 2, action: 'Summarize with AI', action_type: 'ai_reasoning' },
      ],
    });
    const report = await generateBlueprintReport({ blueprint: bp });
    const titles = report.sections.implementation_roadmap.map((p) => p.title).join(' ');
    expect(titles).toMatch(/AI steps/);
    expect(titles).toMatch(/Human approval/);
    expect(report.sections.human_approval_points.points).toContain('Manager approves refunds');
  });

  it('produces security notes and next steps', async () => {
    const report = await generateBlueprintReport({ blueprint: baseBlueprint() });
    expect(report.sections.security_notes.length).toBeGreaterThan(0);
    expect(report.sections.next_steps.length).toBeGreaterThan(0);
  });
});
