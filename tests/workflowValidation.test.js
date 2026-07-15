import { describe, it, expect } from 'vitest';
import { baseWorkflow } from './fixtures.js';
import { validateWorkflow } from '../lib/services/n8nSpecialist.js';
import { isWorkflowStale } from '../lib/services/workflowStatus.js';

describe('P2 — n8n structural validator', () => {
  it('a well-formed workflow passes', () => {
    expect(validateWorkflow(baseWorkflow())).toEqual([]);
  });

  it('non-numeric typeVersion fails', () => {
    const wf = baseWorkflow();
    wf.nodes[1].typeVersion = '3';
    expect(validateWorkflow(wf).some((e) => /typeVersion/.test(e))).toBe(true);
  });

  it('a bad position fails', () => {
    const wf = baseWorkflow();
    wf.nodes[1].position = [0];
    expect(validateWorkflow(wf).some((e) => /position/.test(e))).toBe(true);
  });

  it('non-object parameters fails', () => {
    const wf = baseWorkflow();
    wf.nodes[1].parameters = null;
    expect(validateWorkflow(wf).some((e) => /parameters/.test(e))).toBe(true);
  });

  it('more than one trigger fails (exactly one required)', () => {
    const wf = baseWorkflow();
    wf.nodes.push({ id: '3', name: 'Second trigger', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1, position: [0, 200], parameters: {} });
    expect(validateWorkflow(wf).some((e) => /exactly one trigger/.test(e))).toBe(true);
  });

  it('an orphan (unconnected) non-trigger node fails', () => {
    const wf = baseWorkflow();
    wf.nodes.push({ id: '3', name: 'Orphan', type: 'n8n-nodes-base.set', typeVersion: 3, position: [440, 0], parameters: {} });
    expect(validateWorkflow(wf).some((e) => /orphan/.test(e))).toBe(true);
  });

  it('a connection to a non-existent node fails', () => {
    const wf = baseWorkflow();
    wf.connections['On new lead'].main[0][0].node = 'Ghost';
    expect(validateWorkflow(wf).some((e) => /unknown node/.test(e))).toBe(true);
  });
});

describe('QA case 7 — workflow staleness', () => {
  it('workflow from v5 is stale when the blueprint is v6', () => {
    expect(isWorkflowStale(5, 6)).toBe(true);
  });
  it('workflow from v6 is current when the blueprint is v6', () => {
    expect(isWorkflowStale(6, 6)).toBe(false);
  });
  it('missing versions are treated as not-stale', () => {
    expect(isWorkflowStale(null, 6)).toBe(false);
  });
});
