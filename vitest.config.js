import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  // Match Next's `@/…` path alias so tests can import app routes/components.
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    // Load .env so modules that construct the OpenAI/Pinecone clients at import
    // time (via lib/config/*) don't throw. No network calls happen at import.
    setupFiles: ['tests/setup.js'],
  },
});
