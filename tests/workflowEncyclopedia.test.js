import { describe, it, expect } from 'vitest';
import { analyzeWorkflow, structuralSimilarity } from '../lib/services/workflow-encyclopedia/workflowAnalyzer.js';
import { categorizeWorkflow } from '../lib/services/workflow-encyclopedia/workflowCategorizer.js';
import { scoreWorkflowQuality } from '../lib/services/workflow-encyclopedia/workflowQuality.js';
import { curateWorkflow, dedupeWorkflows } from '../lib/services/workflow-encyclopedia/index.js';

// A realistic Shopify → IF → Google Sheets / Slack workflow (with a sticky note).
const shopifyWorkflow = (over = {}) => JSON.stringify({
  nodes: [
    { name: 'Shopify Trigger', type: 'n8n-nodes-base.shopifyTrigger', parameters: {} },
    { name: 'Is Paid?', type: 'n8n-nodes-base.if', parameters: {} },
    { name: 'Append Row', type: 'n8n-nodes-base.googleSheets', parameters: {} },
    { name: 'Notify Sales', type: 'n8n-nodes-base.slack', parameters: {} },
    { name: 'Note', type: 'n8n-nodes-base.stickyNote', parameters: {} },
  ],
  connections: {
    'Shopify Trigger': { main: [[{ node: 'Is Paid?' }]] },
    'Is Paid?': { main: [[{ node: 'Append Row' }], [{ node: 'Notify Sales' }]] },
  },
  ...over,
});

describe('analyzeWorkflow', () => {
  it('extracts integrations, trigger, branching and ignores sticky notes', () => {
    const a = analyzeWorkflow(shopifyWorkflow());
    expect(a.node_count).toBe(4);                       // sticky note dropped
    expect(a.integrations).toEqual(expect.arrayContaining(['shopify', 'googlesheets', 'slack']));
    expect(a.trigger_type).toBe('app_event');
    expect(a.has_branching).toBe(true);
    expect(a.is_connected).toBe(true);
    expect(a.complexity).toBe('moderate');
    expect(a.fingerprint).toBeTruthy();
  });

  it('detects AI workflows via langchain nodes', () => {
    const a = analyzeWorkflow(JSON.stringify({
      nodes: [
        { name: 'Webhook', type: 'n8n-nodes-base.webhook' },
        { name: 'Agent', type: '@n8n/n8n-nodes-langchain.agent' },
      ],
      connections: { Webhook: { main: [[{ node: 'Agent' }]] } },
    }));
    expect(a.has_ai).toBe(true);
    expect(a.trigger_type).toBe('webhook');
    expect(a.integrations).toContain('langchain');
  });

  it('returns null for empty / unparseable workflows', () => {
    expect(analyzeWorkflow('not json')).toBeNull();
    expect(analyzeWorkflow(JSON.stringify({ nodes: [] }))).toBeNull();
  });

  it('same structure → same fingerprint; different → different', () => {
    expect(analyzeWorkflow(shopifyWorkflow()).fingerprint).toBe(analyzeWorkflow(shopifyWorkflow()).fingerprint);
    const other = analyzeWorkflow(JSON.stringify({ nodes: [{ name: 'A', type: 'n8n-nodes-base.slack' }], connections: {} }));
    expect(other.fingerprint).not.toBe(analyzeWorkflow(shopifyWorkflow()).fingerprint);
  });
});

describe('categorizeWorkflow', () => {
  it('categorizes an e-commerce workflow and tags its traits', () => {
    const c = categorizeWorkflow(analyzeWorkflow(shopifyWorkflow()));
    expect(c.category).toBe('ecommerce');            // Shopify dominates
    expect(c.tags).toContain('branching');
    expect(c.tags).toContain('multi-system');
  });

  it('falls back sensibly when no known integration matches', () => {
    const a = analyzeWorkflow(JSON.stringify({
      nodes: [{ name: 'Cron', type: 'n8n-nodes-base.scheduleTrigger' }, { name: 'HTTP', type: 'n8n-nodes-base.httpRequest' }],
      connections: { Cron: { main: [[{ node: 'HTTP' }]] } },
    }));
    expect(categorizeWorkflow(a).category).toBe('scheduled_jobs');
  });
});

describe('scoreWorkflowQuality', () => {
  it('scores a real multi-system workflow as good/excellent', () => {
    const q = scoreWorkflowQuality(analyzeWorkflow(shopifyWorkflow()), { name: 'Shopify order to Sheets + Slack' });
    expect(q.score).toBeGreaterThanOrEqual(55);
    expect(q.is_low_quality).toBe(false);
  });

  it('flags a trivial single-node workflow as low quality', () => {
    const a = analyzeWorkflow(JSON.stringify({ nodes: [{ name: 'Set', type: 'n8n-nodes-base.set' }], connections: {} }));
    const q = scoreWorkflowQuality(a, { name: 'test' });
    expect(q.is_trivial).toBe(true);
    expect(q.is_low_quality).toBe(true);
    expect(q.tier).toBe('low');
  });

  it('flags a disconnected, triggerless workflow', () => {
    const a = analyzeWorkflow(JSON.stringify({
      nodes: [{ name: 'A', type: 'n8n-nodes-base.slack' }, { name: 'B', type: 'n8n-nodes-base.googleSheets' }, { name: 'C', type: 'n8n-nodes-base.hubspot' }],
      connections: {},
    }));
    expect(a.is_connected).toBe(false);
    expect(scoreWorkflowQuality(a, {}).is_low_quality).toBe(true);
  });
});

describe('curateWorkflow + dedupeWorkflows', () => {
  it('produces a full curated record from a DB row', () => {
    const rec = curateWorkflow({ ID: 42, NAME: 'Shopify sync', WORKFLOW_JSON: shopifyWorkflow() });
    expect(rec.valid).toBe(true);
    expect(rec.id).toBe(42);
    expect(rec.category).toBe('ecommerce');
    expect(rec.quality_score).toBeGreaterThan(0);
    expect(rec.blueprint_pattern.systems).toContain('shopify');
  });

  it('collapses exact-duplicate workflows to one canonical (highest quality)', () => {
    const records = [
      curateWorkflow({ id: 1, name: 'A', workflow_json: shopifyWorkflow() }),
      curateWorkflow({ id: 2, name: 'A copy', workflow_json: shopifyWorkflow() }),
      curateWorkflow({ id: 3, name: 'Different', workflow_json: JSON.stringify({ nodes: [{ name: 'W', type: 'n8n-nodes-base.webhook' }, { name: 'H', type: 'n8n-nodes-base.hubspot' }], connections: { W: { main: [[{ node: 'H' }]] } } }) }),
    ];
    const { canonical, duplicates } = dedupeWorkflows(records);
    expect(canonical.length).toBe(2);   // two distinct patterns
    expect(duplicates.length).toBe(1);  // one copy removed
  });

  it('structuralSimilarity is 1 for identical, <1 for different', () => {
    const a = analyzeWorkflow(shopifyWorkflow());
    const b = analyzeWorkflow(JSON.stringify({ nodes: [{ name: 'W', type: 'n8n-nodes-base.webhook' }], connections: {} }));
    expect(structuralSimilarity(a, a)).toBe(1);
    expect(structuralSimilarity(a, b)).toBeLessThan(1);
  });
});
