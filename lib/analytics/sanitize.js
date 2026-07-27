/**
 * Analytics property sanitizer — the privacy boundary for BOTH the client and
 * server trackers. Isomorphic + pure (no crypto, no DB) so it runs in the
 * browser and in route handlers alike.
 *
 * Rule: STRICT ALLOWLIST. Only the keys below are ever sent to Mixpanel, and
 * only when they coerce to a safe primitive. Everything else — raw Blueprint
 * text, user messages, workflow JSON, emails, tokens/credentials, customer/CRM
 * data, DB URLs, error stacks, arbitrary objects — is dropped by default, not
 * by blocklist. A new field is invisible to analytics until it's added here on
 * purpose.
 */

// Every analytics property Vyrade is allowed to emit. Keep this the single
// source of truth; adding a key is a deliberate, reviewable act.
export const ALLOWED_PROPERTIES = new Set([
  // Non-PII identifiers / references
  'user_id', 'blueprint_id', 'blueprint_version', 'version', 'session_id', 'from_session_id',
  // Blueprint metrics
  'readiness_score', 'readiness_status', 'status', 'systems_count', 'process_steps_count',
  // Workflow generation
  'node_count', 'import_check', 'repair_attempts', 'is_regenerate', 'source', 'duration_ms',
  // Platform / export
  'platform', 'kind', 'readiness', 'grounded', 'file_count', 'part',
  // LLM / cost
  'model', 'operation', 'prompt_tokens', 'completion_tokens', 'total_tokens', 'cost_usd',
  // Auth outcomes (categories/flags only — never the email or raw error)
  'resent', 'rate_limited', 'needs_verification', 'error_category', 'status_code',
  'context', 'signup_source', 'email_verified',
  // UI / navigation / misc (all non-identifying)
  'theme', 'path', 'chat_count', 'char_count', 'is_first_message',
]);

/**
 * Coerce a value to a safe analytics primitive, or undefined to drop it.
 * - numbers / booleans pass
 * - short strings pass, but anything that looks like an email, URL/credential,
 *   or a long blob is refused (defense-in-depth even for allowlisted keys)
 * - objects / arrays / functions are always dropped (could carry blueprint or
 *   workflow payloads)
 */
function coerce(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    if (v.length > 200) return undefined;        // no large text blobs
    if (/@/.test(v)) return undefined;           // no emails
    if (/:\/\//.test(v)) return undefined;       // no URLs / connection strings
    return v;
  }
  return undefined;                              // drop objects, arrays, etc.
}

/** Filter a props object down to the allowlist, with safe coercion. */
export function sanitizeProps(props) {
  const out = {};
  for (const [k, v] of Object.entries(props || {})) {
    if (!ALLOWED_PROPERTIES.has(k)) continue;    // strict allowlist
    if (v === undefined || v === null) continue;
    const safe = coerce(v);
    if (safe !== undefined) out[k] = safe;
  }
  return out;
}

/**
 * Map an HTTP status (or nothing) to a coarse, non-sensitive error category so
 * we can chart failures without shipping raw error messages/stacks.
 */
export function errorCategory(status) {
  if (status === 429) return 'rate_limited';
  if (status === 403) return 'forbidden';
  if (status === 401) return 'unauthorized';
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
  if (status === 400) return 'bad_request';
  if (typeof status === 'number' && status >= 500) return 'server_error';
  return 'error';
}

export default { ALLOWED_PROPERTIES, sanitizeProps, errorCategory };
