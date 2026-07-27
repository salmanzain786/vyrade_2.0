/**
 * Workflow Encyclopedia — structural analyzer.
 *
 * Turns a raw n8n workflow JSON into normalized, comparable structural facts:
 * node types, integrations (apps), trigger kind, branching/AI/error-handling,
 * connectivity, complexity, a Blueprint-shaped pattern, and a stable structural
 * fingerprint for duplicate detection.
 *
 * Pure + deterministic (no DB, no crypto) so it runs in a batch pipeline and in
 * tests identically. Credentials/params are never read — only structure.
 */

// n8n utility nodes that are NOT third-party integrations.
const UTILITY = new Set([
  'set', 'if', 'switch', 'merge', 'filter', 'function', 'functionitem', 'code',
  'noop', 'stickynote', 'wait', 'splitinbatches', 'itemlists', 'datetime', 'sort',
  'limit', 'aggregate', 'renamekeys', 'html', 'xml', 'markdown', 'crypto',
  'compression', 'start', 'executeworkflow', 'respondtowebhook', 'stopanderror',
  'errortrigger', 'converttofile', 'extractfromfile', 'editfields',
  'splitout', 'summarize', 'removeduplicates', 'rssfeedread', 'emailreadimap',
  'spreadsheetfile', 'movebinarydata', 'readbinaryfile', 'writebinaryfile',
  'readbinaryfiles', 'writebinaryfiles', 'readpdf', 'filesystem',
]);
// Utility trigger nodes (not app integrations).
const TRIGGER_UTILITY = new Set([
  'manualtrigger', 'scheduletrigger', 'cron', 'interval', 'webhook', 'start',
  'errortrigger', 'executeworkflowtrigger', 'n8ntrigger', 'formtrigger',
]);
const BRANCHING = new Set(['if', 'switch', 'filter', 'merge']);
const AI_APPS = new Set(['openai', 'anthropic', 'huggingface', 'cohere', 'langchain', 'googlepalm', 'mistral']);
const NOISE = new Set(['stickynote']);

/** Short type: drop the vendor prefix. e.g. 'n8n-nodes-base.slack' → 'slack'. */
export function shortType(type) {
  return String(type || '')
    .replace(/^n8n-nodes-base\./, '')
    .replace(/^@n8n\/n8n-nodes-langchain\./, 'langchain.')
    .replace(/^@?n8n\/nodes-langchain\./, 'langchain.');
}

/** The integration app a node represents, or null for utility/generic nodes. */
export function appFromType(type) {
  const s = shortType(type);
  if (s.startsWith('langchain.')) return 'langchain';
  const full = s.toLowerCase();
  // Catch utility triggers (manualTrigger, scheduleTrigger, n8nTrigger, …)
  // BEFORE stripping the 'Trigger' suffix, so they don't leak as fake apps.
  if (UTILITY.has(full) || TRIGGER_UTILITY.has(full)) return null;
  const low = full.replace(/trigger$/, ''); // shopifyTrigger → shopify
  if (!low || UTILITY.has(low) || TRIGGER_UTILITY.has(low)) return null;
  if (low === 'httprequest' || low === 'webhook' || low === 'noop' || low === 'code') return null;
  return low;
}

const isBranching = (low) => BRANCHING.has(low);
const isTriggerNode = (low) => low.endsWith('trigger') || TRIGGER_UTILITY.has(low);

function djb2(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = (((h << 5) + h) ^ str.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/**
 * @param {string|object} workflowJson
 * @param {object} [meta]  { name }
 * @returns {object|null} analysis, or null if the JSON is unusable
 */
export function analyzeWorkflow(workflowJson, meta = {}) {
  let wf;
  try { wf = typeof workflowJson === 'string' ? JSON.parse(workflowJson) : workflowJson; }
  catch { return null; }
  const rawNodes = Array.isArray(wf?.nodes) ? wf.nodes : [];
  const nodes = rawNodes.filter((n) => n && !NOISE.has(shortType(n.type).toLowerCase()));
  if (nodes.length === 0) return null;

  const typeOf = new Map(nodes.map((n) => [n.name, shortType(n.type).toLowerCase()]));
  const shortTypes = nodes.map((n) => shortType(n.type).toLowerCase());
  const nodeTypeSet = [...new Set(shortTypes)];

  const integrations = [...new Set(nodes.map((n) => appFromType(n.type)).filter(Boolean))];
  const has_branching = shortTypes.some(isBranching);
  const has_ai = shortTypes.some((t) => t.startsWith('langchain.')) || integrations.some((a) => AI_APPS.has(a));
  const has_error_handling = shortTypes.some((t) => t === 'errortrigger' || t === 'stopanderror');

  // Trigger classification.
  let trigger_type = 'unknown';
  if (shortTypes.some((t) => t.includes('webhook'))) trigger_type = 'webhook';
  else if (shortTypes.some((t) => t.includes('schedule') || t === 'cron' || t === 'interval')) trigger_type = 'schedule';
  else if (shortTypes.some((t) => t.endsWith('trigger') && !TRIGGER_UTILITY.has(t))) trigger_type = 'app_event';
  else if (shortTypes.some((t) => t === 'manualtrigger' || t === 'start' || t === 'formtrigger')) trigger_type = 'manual';

  // Connectivity: which nodes appear as an edge source or target.
  const referenced = new Set();
  const edges = [];
  for (const [src, outputs] of Object.entries(wf?.connections || {})) {
    if (!typeOf.has(src)) continue;
    const main = Array.isArray(outputs?.main) ? outputs.main : [];
    for (const branch of main) {
      for (const link of Array.isArray(branch) ? branch : []) {
        if (link?.node && typeOf.has(link.node)) {
          referenced.add(src); referenced.add(link.node);
          edges.push(`${typeOf.get(src)}>${typeOf.get(link.node)}`);
        }
      }
    }
  }
  const node_count = nodes.length;
  const is_connected = node_count >= 2 && referenced.size >= node_count - 1;

  const complexity =
    node_count < 2 ? 'trivial' :
    node_count <= 3 ? 'simple' :
    node_count <= 9 ? 'moderate' :
    node_count <= 25 ? 'complex' : 'advanced';

  // Structural fingerprint: node-type multiset + edge type-pairs. Two workflows
  // with the same fingerprint are structural duplicates.
  const typeCounts = {};
  for (const t of shortTypes) typeCounts[t] = (typeCounts[t] || 0) + 1;
  const typeSig = Object.entries(typeCounts).sort().map(([t, c]) => `${t}:${c}`).join(',');
  const edgeSig = [...new Set(edges)].sort().join(',');
  const structure_signature = `${typeSig}::${edgeSig}`;
  const fingerprint = djb2(structure_signature);

  return {
    node_count,
    node_types: nodeTypeSet,
    integrations,
    integration_count: integrations.length,
    trigger_type,
    has_branching,
    has_ai,
    has_error_handling,
    connection_count: edges.length,
    is_connected,
    complexity,
    structure_signature,
    fingerprint,
    // Blueprint-shaped pattern, so encyclopedia workflows can be matched to a
    // user's Blueprint (systems + trigger + capabilities).
    blueprint_pattern: {
      trigger_type,
      systems: integrations,
      has_branching,
      has_ai,
      node_count,
    },
  };
}

/** Jaccard similarity of two analyses by node-type set (0..1). */
export function structuralSimilarity(a, b) {
  if (!a?.node_types || !b?.node_types) return 0;
  const A = new Set(a.node_types), B = new Set(b.node_types);
  if (A.size === 0 && B.size === 0) return 1;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter += 1;
  return inter / (A.size + B.size - inter);
}

export default { analyzeWorkflow, structuralSimilarity, shortType, appFromType };
