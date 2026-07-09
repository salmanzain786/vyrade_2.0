import { Pinecone } from '@pinecone-database/pinecone';

// Embedding model MUST match the model used to populate the index, otherwise
// query vectors won't align with stored vectors (dimension mismatch / poor
// recall). Index was built with text-embedding-3-large (3072 dims).
export const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-3-large';

export const PINECONE_INDEX = process.env.PINECONE_INDEX;
export const PINECONE_NAMESPACE = process.env.PINECONE_NAMESPACE || undefined;

let _index = null;

/**
 * Lazily construct the Pinecone index handle (optionally namespaced). Throws a
 * clear error if configuration is missing so workflow generation fails loudly
 * rather than silently returning an empty context.
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
