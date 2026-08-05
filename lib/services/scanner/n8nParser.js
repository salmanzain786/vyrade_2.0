/**
 * n8n workflow structure parser (Phase 1, milestone 1.1).
 *
 * Parses an n8n workflow JSON into the shared WorkflowModel. Vyrade already
 * generates/exports this format, so real fixtures test it immediately. Hardened
 * against malformed/partial JSON (real exports have irregular connections).
 */
import { shortType, appFromType } from '../workflow-encyclopedia/workflowAnalyzer.js';

const isTriggerType = (type, short) =>
  /trigger$/i.test(type || '') || short === 'webhook' || short === 'cron' || short === 'interval' || short === 'manualTrigger';

const AI_RE = /langchain|openai|anthropic|\.lmChat|agent|cohere|huggingface|mistral/i;
const BROWSER_RE = /puppeteer|playwright|browserless|selenium|\bbrowser\b/i;

function classify(node) {
  const type = node?.type || '';
  const short = shortType(type);
  const app = appFromType(type);
  const short_l = short.toLowerCase();
  return {
    id: String(node?.id ?? node?.name ?? ''),
    name: node?.name || short || 'Unnamed',
    type,
    shortType: short,
    app,
    isTrigger: isTriggerType(type, short),
    isWebhook: short_l === 'webhook' || /webhook/i.test(type),
    isHttp: short_l === 'httprequest' || /httprequest/i.test(type),
    isAI: AI_RE.test(type) || short_l === 'openai',
    isBrowser: BROWSER_RE.test(type),
    parameters: node?.parameters && typeof node.parameters === 'object' ? node.parameters : {},
    credentials: node?.credentials && typeof node.credentials === 'object' ? node.credentials : {},
    // n8n per-node resilience flags (used by the structural detector).
    _continueOnFail: node?.continueOnFail === true || node?.parameters?.continueOnFail === true,
    _onError: node?.onError || null,
    // Retry configuration (Phase 1 generic check; Phase 6 owns policy limits).
    retryOnFail: node?.retryOnFail === true,
    maxTries: Number.isFinite(node?.maxTries) ? node.maxTries : null,
  };
}

/** Build directional edges from n8n's name-keyed connections object. */
function parseConnections(connections) {
  const edges = [];
  if (!connections || typeof connections !== 'object') return edges;
  for (const [from, outputs] of Object.entries(connections)) {
    const groups = outputs?.main;
    if (!Array.isArray(groups)) continue;
    for (const branch of groups) {
      if (!Array.isArray(branch)) continue;
      for (const link of branch) {
        if (link?.node) edges.push({ from, to: link.node });
      }
    }
  }
  return edges;
}

/** @returns {import('./model.js').WorkflowModel} */
export function parseN8n(workflowJson) {
  const wf = typeof workflowJson === 'string' ? safeParse(workflowJson) : workflowJson;
  if (!wf || typeof wf !== 'object') throw new Error('Invalid n8n workflow JSON');

  const rawNodes = Array.isArray(wf.nodes) ? wf.nodes : [];
  const nodes = rawNodes.map(classify);
  const connections = parseConnections(wf.connections);

  const hasErrorTrigger = nodes.some((n) => /errorTrigger/i.test(n.type));
  const hasNodeLevelHandling = nodes.some((n) => n._continueOnFail || (n._onError && n._onError !== 'stopWorkflow'));
  const hasErrorWorkflow = Boolean(wf.settings && wf.settings.errorWorkflow);

  return {
    platform: 'n8n',
    name: wf.name || 'Untitled workflow',
    nodes,
    connections,
    triggerIds: nodes.filter((n) => n.isTrigger).map((n) => n.id),
    hasErrorHandling: hasErrorTrigger || hasNodeLevelHandling || hasErrorWorkflow,
    raw: wf,
  };
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}
