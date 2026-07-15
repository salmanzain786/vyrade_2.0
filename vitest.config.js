import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    // Load .env so modules that construct the OpenAI/Pinecone clients at import
    // time (via lib/config/*) don't throw. No network calls happen at import.
    setupFiles: ['tests/setup.js'],
  },
});
