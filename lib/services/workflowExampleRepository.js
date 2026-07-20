import { pool } from '../config/db.js';

// Workflow examples live in MySQL (`n8n_node_workflows`), keyed by the
// `mysql_id` that Pinecone returns in its metadata. Pinecone gives us semantic
// relevance; MySQL gives us the actual WORKFLOW_JSON.
//
// The table/database are configurable so the source can be re-pointed (e.g.
// after a data migration) without a code change.
const TABLE = process.env.WORKFLOW_EXAMPLE_TABLE || 'n8n_node_workflows';
const DATABASE = process.env.WORKFLOW_EXAMPLE_DB || ''; // '' = the app's own DB

// Identifiers can't be parameterized, so they're whitelisted rather than
// interpolated blind. IDs themselves always go through placeholders.
const SAFE_IDENT = /^[A-Za-z0-9_]+$/;
function qualifiedTable() {
  if (!SAFE_IDENT.test(TABLE)) throw new Error(`Invalid WORKFLOW_EXAMPLE_TABLE: ${TABLE}`);
  if (DATABASE && !SAFE_IDENT.test(DATABASE)) throw new Error(`Invalid WORKFLOW_EXAMPLE_DB: ${DATABASE}`);
  return DATABASE ? `\`${DATABASE}\`.\`${TABLE}\`` : `\`${TABLE}\``;
}

// n8n annotation nodes carry no structural meaning — drop them from examples.
const NOISE_NODE_TYPES = new Set(['n8n-nodes-base.stickyNote']);

const clip = (s, n) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
};

/**
 * Turn a full n8n workflow (6–19 KB of JSON) into a compact structural
 * skeleton: which node TYPES it uses and how they're wired. That is what makes
 * an example useful as a template — the specialist should learn the shape and
 * node choices, not copy someone else's parameters or credentials.
 */
export function compactWorkflow(workflowJson, { maxChars = 1400 } = {}) {
  let wf;
  try {
    wf = typeof workflowJson === 'string' ? JSON.parse(workflowJson) : workflowJson;
  } catch {
    return null; // unparseable → skip rather than feed the model garbage
  }
  const nodes = (wf?.nodes || []).filter((n) => n && !NOISE_NODE_TYPES.has(n.type));
  if (nodes.length === 0) return null;

  const typeOf = new Map(nodes.map((n) => [n.name, n.type]));
  const short = (t) => String(t || '').replace(/^n8n-nodes-base\./, '').replace(/^@n8n\/n8n-nodes-langchain\./, 'langchain.');

  const steps = nodes.map((n) => `${n.name} [${short(n.type)}]`);

  // Compact wiring: "Source → TargetA, TargetB"
  const edges = [];
  for (const [src, outputs] of Object.entries(wf?.connections || {})) {
    if (!typeOf.has(src)) continue; // skip edges from dropped/unknown nodes
    const targets = [];
    for (const branch of outputs?.main || []) {
      for (const link of branch || []) {
        if (link?.node && typeOf.has(link.node)) targets.push(link.node);
      }
    }
    if (targets.length) edges.push(`${src} → ${[...new Set(targets)].join(', ')}`);
  }

  const body = [
    `Nodes (${nodes.length}): ${steps.join(' | ')}`,
    edges.length ? `Flow: ${edges.join(' ; ')}` : null,
  ].filter(Boolean).join('\n');

  return clip(body, maxChars);
}

/**
 * Fetch and compact workflow examples for the given mysql_ids.
 * IDs with no row (or unparseable JSON) are skipped silently — the Pinecone
 * index may reference rows this database doesn't have yet.
 * Returns records in the order the ids were given (i.e. by relevance).
 */
export async function getWorkflowExamplesByIds(ids, { maxCharsPerExample = 1400 } = {}) {
  const numeric = [...new Set((ids || []).map(Number).filter(Number.isFinite))];
  if (numeric.length === 0) return [];

  const placeholders = numeric.map(() => '?').join(',');
  const [rows] = await pool.query(
    `SELECT ID, NAME, DESCRIPTION, WORKFLOW_JSON
       FROM ${qualifiedTable()}
      WHERE ID IN (${placeholders})
        AND WORKFLOW_JSON IS NOT NULL
        AND LENGTH(WORKFLOW_JSON) > 100`,
    numeric
  );

  const byId = new Map(rows.map((r) => [Number(r.ID), r]));
  const out = [];
  for (const id of numeric) {            // preserve relevance ordering
    const row = byId.get(id);
    if (!row) continue;
    const skeleton = compactWorkflow(row.WORKFLOW_JSON, { maxChars: maxCharsPerExample });
    if (!skeleton) continue;
    out.push({
      id,
      name: row.NAME || `Workflow ${id}`,
      description: clip(row.DESCRIPTION, 220),
      skeleton,
    });
  }
  return out;
}
