import { Pinecone } from '@pinecone-database/pinecone';

// Embedding model MUST match the model used to populate the index, otherwise
// query vectors won't align with stored vectors (dimension mismatch / poor
// recall). Index was built with text-embedding-3-large (3072 dims).
export const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-3-large';

// --- n8n node knowledge index (primary Pinecone account) ---
export const PINECONE_INDEX = process.env.PINECONE_INDEX;
export const PINECONE_NAMESPACE = process.env.PINECONE_NAMESPACE || undefined;

// --- Vyrade tools index (separate Pinecone account) — tools + API docs ---
export const PINECONE_TOOL_INDEX = process.env.PINECONE_TOOL_INDEX;
export const PINECONE_TOOL_NAMESPACE = process.env.PINECONE_TOOL_NAMESPACE || undefined;
// Defaults to the same embedding model as the node index unless overridden.
export const TOOL_EMBEDDING_MODEL = process.env.PINECONE_TOOL_EMBEDDING_MODEL || EMBEDDING_MODEL;

// --- Vyrade MCP index (separate Pinecone account) — MCP connectors + docs ---
// Powers the Claude Code export package (recommended MCPs).
export const PINECONE_MCP_INDEX = process.env.PINECONE_MCP_INDEX;
export const PINECONE_MCP_NAMESPACE = process.env.PINECONE_MCP_NAMESPACE || undefined;
export const MCP_EMBEDDING_MODEL = process.env.PINECONE_MCP_EMBEDDING_MODEL || EMBEDDING_MODEL;

// --- Make.com modules index (separate account) — Make app/action modules ---
// Isolated from n8n/Claude routes (Task 11). Powers the Make export guide.
export const PINECONE_MAKE_INDEX = process.env.PINECONE_MAKE_INDEX;
export const PINECONE_MAKE_NAMESPACE = process.env.PINECONE_MAKE_NAMESPACE || undefined;
export const MAKE_EMBEDDING_MODEL = process.env.PINECONE_MAKE_EMBEDDING_MODEL || EMBEDDING_MODEL;

// --- Zapier actions index (separate account) — placeholder for Task 11 ---
export const PINECONE_ZAPIER_INDEX = process.env.PINECONE_ZAPIER_INDEX;
export const PINECONE_ZAPIER_NAMESPACE = process.env.PINECONE_ZAPIER_NAMESPACE || undefined;
export const ZAPIER_EMBEDDING_MODEL = process.env.PINECONE_ZAPIER_EMBEDDING_MODEL || EMBEDDING_MODEL;

let _index = null;
let _toolIndex = null;
let _mcpIndex = null;
let _makeIndex = null;
let _zapierIndex = null;

/**
 * Lazily construct the n8n-node Pinecone index handle (optionally namespaced).
 * Throws a clear error if configuration is missing so workflow generation fails
 * loudly rather than silently returning an empty context.
 */
export function getPineconeIndex() {
  if (!process.env.PINECONE_API_KEY) {
    throw new Error('PINECONE_API_KEY is not set — cannot retrieve n8n node knowledge.');
  }
  if (!PINECONE_INDEX) {
    throw new Error('PINECONE_INDEX is not set — cannot retrieve n8n node knowledge.');
  }
  if (!_index) {
    const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
    const idx = pc.index(PINECONE_INDEX);
    _index = PINECONE_NAMESPACE ? idx.namespace(PINECONE_NAMESPACE) : idx;
  }
  return _index;
}

/** Whether the Vyrade tools index is configured (its own account/key/index). */
export function isToolIndexConfigured() {
  return Boolean(process.env.PINECONE_TOOL_API_KEY && PINECONE_TOOL_INDEX);
}

/**
 * Lazily construct the Vyrade tools Pinecone index handle. This lives in a
 * SEPARATE Pinecone account (PINECONE_TOOL_API_KEY), so it uses its own client.
 * Returns null when not configured, so generation can proceed with n8n nodes
 * alone rather than failing.
 */
export function getPineconeToolIndex() {
  if (!isToolIndexConfigured()) return null;
  if (!_toolIndex) {
    const pc = new Pinecone({ apiKey: process.env.PINECONE_TOOL_API_KEY });
    const idx = pc.index(PINECONE_TOOL_INDEX);
    _toolIndex = PINECONE_TOOL_NAMESPACE ? idx.namespace(PINECONE_TOOL_NAMESPACE) : idx;
  }
  return _toolIndex;
}

/** Whether the Vyrade MCP index is configured (its own account/key/index). */
export function isMcpIndexConfigured() {
  return Boolean(process.env.PINECONE_MCP_API_KEY && PINECONE_MCP_INDEX);
}

/**
 * Lazily construct the Vyrade MCP Pinecone index handle (separate account).
 * Returns null when not configured so the Claude export can still produce a
 * package (recommending API/custom integration when no MCP is found).
 */
export function getPineconeMcpIndex() {
  if (!isMcpIndexConfigured()) return null;
  if (!_mcpIndex) {
    const pc = new Pinecone({ apiKey: process.env.PINECONE_MCP_API_KEY });
    const idx = pc.index(PINECONE_MCP_INDEX);
    _mcpIndex = PINECONE_MCP_NAMESPACE ? idx.namespace(PINECONE_MCP_NAMESPACE) : idx;
  }
  return _mcpIndex;
}

// --- Make.com ---
export function isMakeIndexConfigured() {
  return Boolean(process.env.PINECONE_MAKE_API_KEY && PINECONE_MAKE_INDEX);
}

export function getPineconeMakeIndex() {
  if (!isMakeIndexConfigured()) return null;
  if (!_makeIndex) {
    const pc = new Pinecone({ apiKey: process.env.PINECONE_MAKE_API_KEY });
    const idx = pc.index(PINECONE_MAKE_INDEX);
    _makeIndex = PINECONE_MAKE_NAMESPACE ? idx.namespace(PINECONE_MAKE_NAMESPACE) : idx;
  }
  return _makeIndex;
}

// --- Zapier (placeholder — not configured yet) ---
export function isZapierIndexConfigured() {
  return Boolean(process.env.PINECONE_ZAPIER_API_KEY && PINECONE_ZAPIER_INDEX);
}

export function getPineconeZapierIndex() {
  if (!isZapierIndexConfigured()) return null;
  if (!_zapierIndex) {
    const pc = new Pinecone({ apiKey: process.env.PINECONE_ZAPIER_API_KEY });
    const idx = pc.index(PINECONE_ZAPIER_INDEX);
    _zapierIndex = PINECONE_ZAPIER_NAMESPACE ? idx.namespace(PINECONE_ZAPIER_NAMESPACE) : idx;
  }
  return _zapierIndex;
}
