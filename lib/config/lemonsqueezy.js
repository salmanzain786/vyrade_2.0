// Lemon Squeezy configuration. Env names match those set in .env
// (LEMON_SQUEEZ_*). The API key is server-only — never expose it to the client.
export const LS_STORE_ID = process.env.LEMON_SQUEEZ_STORE_ID;
export const LS_BASE_URL = process.env.LEMON_SQUEEZ_BASE_URL || 'https://api.lemonsqueezy.com/v1';
export const LS_API_KEY = process.env.LEMON_SQUEEZ_API_KEY;
export const LS_WEBHOOK_SECRET = process.env.LEMON_SQUEEZ_WEBHOOK_SECRET;

/** True when the store + API key are present (so we can talk to Lemon Squeezy). */
export function isLemonConfigured() {
  return Boolean(LS_API_KEY && LS_STORE_ID);
}
