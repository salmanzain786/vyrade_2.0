import { describe, it, expect } from 'vitest';
import { compactWorkflow } from '../lib/services/workflowExampleRepository.js';

// A realistic n8n workflow: trigger → branch → two actions, plus a sticky note.
const WORKFLOW = JSON.stringify({
  meta: { instanceId: 'abc' },
  nodes: [
    { id: '1', name: 'Shopify Trigger', type: 'n8n-nodes-base.shopifyTrigger', typeVersion: 1, position: [0, 0], parameters: { authentication: 'apiKey' }, credentials: { shopifyApi: { id: '7', name: 'REAL CREDENTIAL' } } },
    { id: '2', name: 'Is High Value?', type: 'n8n-nodes-base.if', typeVersion: 2, position: [220, 0], parameters: {} },
    { id: '3', name: 'Append Row', type: 'n8n-nodes-base.googleSheets', typeVersion: 4, position: [440, -80], parameters: { documentId: 'SECRET-SHEET-ID' } },
    { id: '4', name: 'Notify Sales', type: 'n8n-nodes-base.slack', typeVersion: 2, position: [440, 80], parameters: {} },
    { id: '5', name: 'Note', type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: [0, 300], parameters: { content: 'docs' } },
  ],
  connections: {
    'Shopify Trigger': { main: [[{ node: 'Is High Value?', type: 'main', index: 0 }]] },
    'Is High Value?': { main: [
      [{ node: 'Append Row', type: 'main', index: 0 }],
      [{ node: 'Notify Sales', type: 'main', index: 0 }],
    ] },
  },
});

describe('workflow example compaction', () => {
  it('keeps the structure: node names, short types, and wiring', () => {
    const out = compactWorkflow(WORKFLOW);
    expect(out).toContain('Shopify Trigger [shopifyTrigger]');
    expect(out).toContain('Is High Value? [if]');
    expect(out).toContain('Shopify Trigger → Is High Value?');
    // Both IF branches are represented.
    expect(out).toContain('Append Row');
    expect(out).toContain('Notify Sales');
  });

  it('drops sticky notes (annotation, not structure)', () => {
    const out = compactWorkflow(WORKFLOW);
    expect(out).not.toContain('stickyNote');
    expect(out).toContain('Nodes (4)'); // 5 nodes minus the sticky note
  });

  it('does NOT leak parameters or credentials from the example', () => {
    const out = compactWorkflow(WORKFLOW);
    expect(out).not.toContain('REAL CREDENTIAL');
    expect(out).not.toContain('SECRET-SHEET-ID');
    expect(out).not.toContain('apiKey');
  });

  it('shrinks a large workflow to fit the prompt budget', () => {
    const out = compactWorkflow(WORKFLOW, { maxChars: 1400 });
    expect(out.length).toBeLessThanOrEqual(1401);
    expect(out.length).toBeLessThan(WORKFLOW.length); // much smaller than raw JSON
  });

  it('respects an explicit character cap', () => {
    const out = compactWorkflow(WORKFLOW, { maxChars: 60 });
    expect(out.length).toBeLessThanOrEqual(61);
    expect(out.endsWith('…')).toBe(true);
  });

  it('returns null for unusable input instead of feeding the model garbage', () => {
    expect(compactWorkflow('not json {')).toBeNull();
    expect(compactWorkflow(JSON.stringify({ nodes: [] }))).toBeNull();
    expect(compactWorkflow(JSON.stringify({ nodes: [{ name: 'N', type: 'n8n-nodes-base.stickyNote' }] }))).toBeNull();
  });

  it('handles a workflow whose connections reference missing nodes', () => {
    const wf = JSON.stringify({
      nodes: [{ id: '1', name: 'A', type: 'n8n-nodes-base.set' }],
      connections: { A: { main: [[{ node: 'Ghost', type: 'main', index: 0 }]] } },
    });
    const out = compactWorkflow(wf);
    expect(out).toContain('A [set]');
    expect(out).not.toContain('Ghost'); // dangling edge dropped
  });
});
