import { client } from '../config/openai.js';
import { getPineconeIndex, EMBEDDING_MODEL } from '../config/pinecone.js';

/**
 * Build focused retrieval queries from the Blueprint (Section 23). One query
 * for the overall process, one per involved system, and one covering the
 * required action types — so the union of results covers both the systems the
 * workflow touches and the kinds of nodes it needs.
 */
function buildQueries(bp) {
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

// The index stores each n8n node as structured metadata (name, type, category,
// description, and the full node JSON under "parameters"). Compose the fields
// useful for grounding the specialist into one readable block; the node JSON is
// the most valuable part because it shows real type/typeVersion/parameters.
const CONTEXT_FIELDS = [
  ['name', 'Node'],
  ['type', 'Type'],
  ['category', 'Category'],
  ['description', 'Description'],
  ['parameters', 'Node JSON'],
];

function extractText(metadata) {
  if (!metadata) return '';

  const parts = [];
  for (const [key, label] of CONTEXT_FIELDS) {
    const val = metadata[key];
    if (typeof val === 'string' && val.trim()) parts.push(`${label}: ${val}`);
  }
  if (parts.length > 0) return parts.join('\n');

  // Fallback for records with a different shape: join all string metadata.
  return Object.entries(metadata)
    .filter(([, v]) => typeof v === 'string' && v.trim())
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
}

/**
 * Embed the Blueprint-derived queries and retrieve the most relevant n8n node
 * documentation from Pinecone. Results are deduped by vector id (keeping the
 * best score) and truncated to a character budget so the specialist prompt
 * stays within a sane size.
 */
export async function retrieveNodeContext(bp, { topK = 5, maxChars = 12000 } = {}) {
  const queries = buildQueries(bp);

  const embedding = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: queries,
  });

  const index = getPineconeIndex();

  const byId = new Map(); // id -> { score, text }
  await Promise.all(embedding.data.map(async (e) => {
    const res = await index.query({ topK, vector: e.embedding, includeMetadata: true });
    for (const match of res.matches || []) {
      const text = extractText(match.metadata);
      if (!text) continue;
      const prev = byId.get(match.id);
      if (!prev || match.score > prev.score) {
        byId.set(match.id, { score: match.score, text });
      }
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

  return { chunks, matchCount: byId.size, queryCount: queries.length };
}
