import { client } from '../config/openai.js';
import {
  getPineconeIndex, getPineconeToolIndex, isToolIndexConfigured,
  getPineconeMcpIndex, isMcpIndexConfigured,
  getPineconeMakeIndex, isMakeIndexConfigured,
  getPineconeZapierIndex, isZapierIndexConfigured,
  EMBEDDING_MODEL, TOOL_EMBEDDING_MODEL, MCP_EMBEDDING_MODEL,
  MAKE_EMBEDDING_MODEL, ZAPIER_EMBEDDING_MODEL,
} from '../config/pinecone.js';

/**
 * Build focused retrieval queries from the Blueprint (Section 23). One query
 * for the overall process, one per involved system, and one covering the
 * required action types — so the union of results covers both the systems the
 * workflow touches and the kinds of nodes it needs.
 */
function buildNodeQueries(bp) {
  const queries = [];
  const goal = bp.business_intent?.business_goal || bp.name || 'automation';
  const trigger = bp.trigger?.event || bp.trigger?.trigger_type || 'unknown trigger';
  queries.push(`n8n workflow to ${goal}. It is started by: ${trigger}.`);

  for (const s of bp.systems || []) {
    queries.push(`n8n node and configuration for ${s.name} (used as ${s.role}).`);
  }

  const actionTypes = [...new Set((bp.process_steps || []).map((s) => s.action_type))];
  if (actionTypes.length > 0) {
    queries.push(`n8n nodes for these operations: ${actionTypes.join(', ')}.`);
  }

  return queries.slice(0, 8);
}

/**
 * Queries aimed at the Vyrade TOOLS index — tools exposed via an HTTP API, with
 * their API documentation. We want tools whose API can perform a step the
 * Blueprint needs (especially where no first-class n8n node exists).
 */
function buildToolQueries(bp) {
  const queries = [];
  const goal = bp.business_intent?.business_goal || bp.name || 'automation';
  queries.push(`API tool with HTTP endpoints to ${goal}.`);

  for (const s of bp.systems || []) {
    queries.push(`Tool or REST API for ${s.name} (used as ${s.role}) with endpoint and authentication docs.`);
  }

  const actionTypes = [...new Set((bp.process_steps || []).map((s) => s.action_type))];
  if (actionTypes.length > 0) {
    queries.push(`API tools to perform: ${actionTypes.join(', ')}.`);
  }

  return queries.slice(0, 8);
}

// n8n node records: name/type/category/description + full node JSON.
const NODE_FIELDS = [
  ['Node', ['name']],
  ['Type', ['type']],
  ['Category', ['category']],
  ['Description', ['description']],
  ['Node JSON', ['parameters']],
];

// Vyrade tool records (Product-Hunt-style): the important field is `api_doc`
// (a JSON string of endpoints + descriptions). Each label tries several
// aliases so schema drift still resolves.
const TOOL_FIELDS = [
  ['Tool', ['name', 'tool_name', 'title']],
  ['Category', ['product_hunt_category', 'category', 'type']],
  ['Tagline', ['tagline']],
  ['Description', ['description', 'overview', 'summary']],
  ['Website', ['website', 'url', 'homepage']],
  ['Features', ['features']],
  ['API Docs', ['api_doc', 'api_documentation', 'api_docs', 'apiDocumentation', 'documentation', 'docs']],
];

// No single retrieved record should dominate the prompt budget — cap each.
const MAX_ITEM_CHARS = 2800;

function truncate(text, max = MAX_ITEM_CHARS) {
  return text.length > max ? text.slice(0, max) + '…' : text;
}

function extractByFields(metadata, fields) {
  if (!metadata) return '';
  const parts = [];
  for (const [label, aliases] of fields) {
    for (const key of aliases) {
      const val = metadata[key];
      if (typeof val === 'string' && val.trim()) { parts.push(`${label}: ${val}`); break; }
    }
  }
  const text = parts.length > 0
    ? parts.join('\n')
    // Fallback: join every string-valued metadata field.
    : Object.entries(metadata)
        .filter(([, v]) => typeof v === 'string' && v.trim())
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n');
  return truncate(text);
}

async function embed(queries, model) {
  const res = await client.embeddings.create({ model, input: queries });
  return res.data.map((d) => d.embedding);
}

/**
 * Query one Pinecone index with a set of query vectors, dedupe matches by id
 * (keeping the best score), and truncate to a character budget.
 */
async function retrieveFrom(index, vectors, { topK, maxChars, extract }) {
  const byId = new Map(); // id -> { score, text }
  await Promise.all(vectors.map(async (vector) => {
    const res = await index.query({ topK, vector, includeMetadata: true });
    for (const match of res.matches || []) {
      const text = extract(match.metadata);
      if (!text) continue;
      const prev = byId.get(match.id);
      if (!prev || match.score > prev.score) byId.set(match.id, { score: match.score, text });
    }
  }));

  const ranked = [...byId.values()].sort((a, b) => b.score - a.score);
  const chunks = [];
  let total = 0;
  for (const r of ranked) {
    if (total + r.text.length > maxChars) break;
    chunks.push(r.text);
    total += r.text.length;
  }
  return { chunks, matchCount: byId.size };
}

/**
 * Retrieve the most relevant n8n node documentation from the primary Pinecone
 * index for this Blueprint.
 */
export async function retrieveNodeContext(bp, { topK = 5, maxChars = 12000 } = {}) {
  const queries = buildNodeQueries(bp);
  const vectors = await embed(queries, EMBEDDING_MODEL);
  const { chunks, matchCount } = await retrieveFrom(getPineconeIndex(), vectors, {
    topK, maxChars, extract: (m) => extractByFields(m, NODE_FIELDS),
  });
  return { chunks, matchCount, queryCount: queries.length };
}

/**
 * Retrieve relevant Vyrade tools (with API docs) from the SECOND Pinecone index.
 * Returns empty results (never throws) when the tool index isn't configured, so
 * generation can proceed with n8n nodes alone.
 */
export async function retrieveToolContext(bp, { topK = 5, maxChars = 9000 } = {}) {
  if (!isToolIndexConfigured()) return { chunks: [], matchCount: 0, queryCount: 0 };
  const index = getPineconeToolIndex();
  if (!index) return { chunks: [], matchCount: 0, queryCount: 0 };

  const queries = buildToolQueries(bp);
  const vectors = await embed(queries, TOOL_EMBEDDING_MODEL);
  const { chunks, matchCount } = await retrieveFrom(index, vectors, {
    topK, maxChars, extract: (m) => extractByFields(m, TOOL_FIELDS),
  });
  return { chunks, matchCount, queryCount: queries.length };
}

// --- Vyrade MCP index (for the Claude Code export package) ---

// Normalize an MCP record's metadata into the fields the exporter needs.
function toMcpRecord(id, score, m = {}) {
  return {
    id,
    score,
    name: m.name || 'Unnamed MCP server',
    description: m.short_description || m.text || '',
    repository: m.repository_url || '',
    url: m.url || m.homepage_url || '',
    tags: m.tags || '',
    config: m.config_json || '',
  };
}

/**
 * Retrieve MCP connectors relevant to each system in the Blueprint from the
 * Vyrade MCP index. Queries per-system so every system gets its own best
 * candidates (used to recommend an MCP per system, or fall back to API/custom
 * integration when none fits). Never throws — returns empty when unconfigured.
 */
export async function retrieveMcpForSystems(bp, { topK = 4 } = {}) {
  const empty = { perSystem: {}, all: [], matchCount: 0, queryCount: 0 };
  if (!isMcpIndexConfigured()) return empty;
  const index = getPineconeMcpIndex();
  if (!index) return empty;

  const systems = (bp.systems || []).map((s) => s.name).filter(Boolean);
  const goal = bp.business_intent?.business_goal || bp.name || 'automation';

  // One query per system + a general goal query.
  const labels = [...systems, `__goal__`];
  const queries = [
    ...systems.map((name) => `MCP server or connector for ${name}: repository access, API, and configuration.`),
    `MCP servers/connectors to ${goal}.`,
  ];
  if (queries.length === 0) return empty;

  const vectors = await embed(queries, MCP_EMBEDDING_MODEL);

  const perSystem = {};
  const byId = new Map();
  await Promise.all(vectors.map(async (vector, i) => {
    const res = await index.query({ topK, vector, includeMetadata: true });
    const recs = (res.matches || []).map((mt) => toMcpRecord(mt.id, mt.score, mt.metadata));
    if (labels[i] !== '__goal__') perSystem[labels[i]] = recs;
    for (const r of recs) {
      const prev = byId.get(r.id);
      if (!prev || r.score > prev.score) byId.set(r.id, r);
    }
  }));

  return {
    perSystem,
    all: [...byId.values()].sort((a, b) => b.score - a.score),
    matchCount: byId.size,
    queryCount: queries.length,
  };
}

// --- Make.com / Zapier module indexes (Task 11) ---
// These are ISOLATED from the n8n and Claude routes: only the Make/Zapier
// exporters call them, and n8n/Claude generation never touches these indexes.

function toMakeRecord(id, score, m = {}) {
  return {
    id,
    score,
    app: m.APP_NAME || m.app_name || '',
    appSlug: m.APP_SLUG || m.app_slug || '',
    action: m.ACTION_NAME || m.action_name || '',
    description: m.ACTION_DESCRIPTION || m.action_description || '',
    module: m.ACTION_NODE || m.action_node || '',
    type: m.ACTION_TYPE || m.action_type || '',
  };
}

/**
 * Retrieve platform modules (Make/Zapier) per Blueprint system from an isolated
 * index. Returns { perSystem, all, matchCount, queryCount, available }. Never
 * throws and returns available:false when the platform index isn't configured
 * (→ the exporter falls back to a generic guide).
 */
async function retrievePlatformModules({ index, model, platformLabel, toRecord, bp, topK }) {
  const empty = { perSystem: {}, all: [], matchCount: 0, queryCount: 0, available: false };
  if (!index) return empty;

  const systems = (bp.systems || []).map((s) => s.name).filter(Boolean);
  const goal = bp.business_intent?.business_goal || bp.name || 'automation';
  const labels = [...systems, '__goal__'];
  const queries = [
    ...systems.map((name) => `${platformLabel} app modules/actions for ${name}: trigger, create, update, send.`),
    `${platformLabel} modules to ${goal}.`,
  ];
  if (queries.length === 0) return empty;

  const vectors = await embed(queries, model);
  const perSystem = {};
  const byId = new Map();
  await Promise.all(vectors.map(async (vector, i) => {
    const res = await index.query({ topK, vector, includeMetadata: true });
    const recs = (res.matches || []).map((mt) => toRecord(mt.id, mt.score, mt.metadata));
    if (labels[i] !== '__goal__') perSystem[labels[i]] = recs;
    for (const r of recs) {
      const prev = byId.get(r.id);
      if (!prev || r.score > prev.score) byId.set(r.id, r);
    }
  }));

  return {
    perSystem,
    all: [...byId.values()].sort((a, b) => b.score - a.score),
    matchCount: byId.size,
    queryCount: queries.length,
    available: true,
  };
}

export async function retrieveMakeModules(bp, { topK = 4 } = {}) {
  if (!isMakeIndexConfigured()) return { perSystem: {}, all: [], matchCount: 0, queryCount: 0, available: false };
  return retrievePlatformModules({
    index: getPineconeMakeIndex(), model: MAKE_EMBEDDING_MODEL,
    platformLabel: 'Make.com', toRecord: toMakeRecord, bp, topK,
  });
}

export async function retrieveZapierModules(bp, { topK = 4 } = {}) {
  // Placeholder — no Zapier index yet, so this returns available:false and the
  // exporter produces a generic implementation guide instead of fake JSON.
  if (!isZapierIndexConfigured()) return { perSystem: {}, all: [], matchCount: 0, queryCount: 0, available: false };
  return retrievePlatformModules({
    index: getPineconeZapierIndex(), model: ZAPIER_EMBEDDING_MODEL,
    platformLabel: 'Zapier', toRecord: toMakeRecord, bp, topK,
  });
}
