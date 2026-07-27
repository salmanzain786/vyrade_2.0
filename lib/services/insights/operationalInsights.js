/**
 * Operational Insights (Task E) — pure helpers.
 *
 * Event vocabulary + parsers that turn a raw n8n import error into the coarse,
 * non-sensitive facts we store: which node failed and a category (never the raw
 * message). This is what powers "Vyrade learns from real workflows".
 */

export const OPS_EVENTS = {
  WORKFLOW_GENERATED: 'workflow_generated',
  IMPORT_FAILED: 'import_failed',
  IMPORT_SKIPPED: 'import_skipped',
  REPAIR_PERFORMED: 'repair_performed',
  DOC_GAP: 'doc_gap',                 // a tool/system with no retrieval hits
  GENERATION_FAILED: 'generation_failed',
  EXPORT_FAILED: 'export_failed',
  REGENERATED: 'regenerated',         // user re-generated (edit signal)
};

const shortNodeType = (type) =>
  String(type || '')
    .replace(/^n8n-nodes-base\./, '')
    .replace(/^@n8n\/n8n-nodes-langchain\./, 'langchain.');

/** Coarse, non-sensitive category for an n8n import error message. */
export function errorCategoryFromN8n(message) {
  const m = String(message || '').toLowerCase();
  if (!m) return 'unknown';
  if (/typeversion/.test(m)) return 'missing_typeversion';
  if (/unknown node type|unrecognized node/.test(m)) return 'unknown_node_type';
  if (/connection/.test(m)) return 'invalid_connections';
  if (/credential/.test(m)) return 'credential_issue';
  if (/must have required property|is required/.test(m)) return 'missing_property';
  if (/timed out|timeout|econnrefused|unreachable/.test(m)) return 'unreachable';
  return 'invalid_workflow';
}

/**
 * Best-effort: which node type an n8n error refers to.
 *  - "request/body/nodes/2 must have …" → nodes[2].type
 *  - "unknown node type: n8n-nodes-base.foo" → that type
 * @returns {string|null} short node type
 */
export function parseFailingNode(message, nodes = []) {
  const msg = String(message || '');

  const explicit = msg.match(/node type[:\s]+["']?([\w.@/-]+)/i);
  if (explicit) return shortNodeType(explicit[1]);

  const idx = msg.match(/nodes\/(\d+)/);
  if (idx) {
    const i = Number(idx[1]);
    if (Number.isFinite(i) && nodes[i]?.type) return shortNodeType(nodes[i].type);
  }
  return null;
}

export default { OPS_EVENTS, errorCategoryFromN8n, parseFailingNode };
