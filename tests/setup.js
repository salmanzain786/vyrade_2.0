// Load .env so lib/config/openai.js (which constructs `new OpenAI({apiKey})`
// at import) doesn't throw during a test import. No network calls are made at
// import time. Fall back to a dummy key so tests run even without a .env.
import 'dotenv/config';

if (!process.env.OPENAI_API_KEY) process.env.OPENAI_API_KEY = 'test-key';
if (!process.env.PINECONE_API_KEY) process.env.PINECONE_API_KEY = 'test-key';
if (!process.env.PINECONE_INDEX) process.env.PINECONE_INDEX = 'test-index';
if (!process.env.AUTH_SECRET) process.env.AUTH_SECRET = 'test-secret-at-least-16-chars';
