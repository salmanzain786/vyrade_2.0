/**
 * Pre-LLM secret redaction.
 *
 * Users paste credentials into chat ("here's my Shopify token: shpat_…").
 * Without this layer that value would be sent to OpenAI *and* stored in MySQL
 * forever. Every piece of user-supplied text is run through `redactSecrets`
 * at the API boundary — before it reaches the model and before it is persisted.
 *
 * Design rules:
 *  - Redact the VALUE, keep the surrounding text, so the Blueprint still reads
 *    sensibly ("token: [REDACTED_SHOPIFY_TOKEN]") and the model understands a
 *    credential was supplied without ever seeing it.
 *  - The original is never stored anywhere. There is no vault, by choice: the
 *    Blueprint is a requirements document and never needs a live credential.
 *  - Ordered most-specific first, so a Slack webhook isn't caught by the
 *    generic URL rule, etc.
 */

const PLACEHOLDER_RE = /^(\[REDACTED|<|\$\{|xxx+$|your[_-]|placeholder|example|changeme|\.\.\.)/i;

/**
 * A value only counts as a secret if it looks like one. This keeps prose such
 * as "password: required" intact while still catching "password: hunter2".
 */
function looksLikeSecretValue(v) {
  if (!v || PLACEHOLDER_RE.test(v)) return false;
  if (v.length >= 16) return true;                       // long opaque strings
  return v.length >= 6 && /[\d\W_]/.test(v);             // mixed alnum/symbols
}

// Provider tokens with distinctive prefixes — high confidence, no heuristics.
const TOKEN_PATTERNS = [
  [/\bsk-ant-[A-Za-z0-9_-]{10,}/g, 'ANTHROPIC_KEY'],
  [/\bsk-proj-[A-Za-z0-9_-]{10,}/g, 'OPENAI_KEY'],
  [/\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{10,}/g, 'STRIPE_KEY'],
  [/\bsk-[A-Za-z0-9]{20,}/g, 'OPENAI_KEY'],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/g, 'GITHUB_TOKEN'],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/g, 'GITHUB_TOKEN'],
  [/\bglpat-[A-Za-z0-9_-]{15,}/g, 'GITLAB_TOKEN'],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}/g, 'SLACK_TOKEN'],
  [/\bshp(?:at|ca|pa|ss)_[A-Za-z0-9]{16,}/g, 'SHOPIFY_TOKEN'],
  [/\bpcsk_[A-Za-z0-9_-]{20,}/g, 'PINECONE_KEY'],
  [/\bAKIA[0-9A-Z]{16}\b/g, 'AWS_ACCESS_KEY_ID'],
  [/\bAIza[0-9A-Za-z_-]{20,}/g, 'GOOGLE_API_KEY'],
  [/\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/g, 'SENDGRID_KEY'],
  [/\bnpm_[A-Za-z0-9]{30,}/g, 'NPM_TOKEN'],
  [/\bdop_v1_[a-f0-9]{40,}/g, 'DIGITALOCEAN_TOKEN'],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, 'JWT'],
];

/**
 * Redact secrets from arbitrary user text.
 * @returns {{ text: string, redactions: string[], count: number }}
 *          `redactions` lists the TYPES found (never the values) so callers can
 *          log/audit without re-leaking anything.
 */
export function redactSecrets(input) {
  if (typeof input !== 'string' || input.length === 0) {
    return { text: input ?? '', redactions: [], count: 0 };
  }

  let text = input;
  const found = [];
  const mark = (type) => { found.push(type); return `[REDACTED_${type}]`; };

  // 1) PEM private key blocks (multi-line) — before anything else.
  text = text.replace(
    /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z ]+ )?PRIVATE KEY-----/g,
    () => mark('PRIVATE_KEY')
  );

  // 2) Slack webhooks (a URL that is itself the credential).
  text = text.replace(
    /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9_\/+-]+/g,
    () => mark('SLACK_WEBHOOK')
  );

  // 3) Credentials embedded in a URL — mysql://, postgres://, mongodb+srv://,
  //    smtp://, redis://, amqp://, or HTTP basic auth. Keep scheme + user so the
  //    host/topology is still described; redact only the password.
  text = text.replace(
    /\b([a-z][a-z0-9+.-]{1,20}):\/\/([^\s:@/]{1,64}):([^\s@/]{1,256})@/gi,
    (_m, scheme, user) => `${scheme}://${user}:${mark('URL_PASSWORD')}@`
  );

  // 4) Known provider tokens.
  for (const [re, type] of TOKEN_PATTERNS) {
    text = text.replace(re, () => mark(type));
  }

  // 5) Authorization headers: "Bearer <token>", "Basic <base64>".
  text = text.replace(
    /\b(Bearer|Basic|Token)\s+([A-Za-z0-9._~+/=-]{12,})/gi,
    (m, scheme, value) => (PLACEHOLDER_RE.test(value) ? m : `${scheme} ${mark('AUTH_TOKEN')}`)
  );

  // 6) Generic "key: value" / "key=value" assignments for secret-ish names.
  text = text.replace(
    /\b(passwords?|passwd|pwd|secrets?|api[_-]?keys?|apikey|access[_-]?tokens?|auth[_-]?tokens?|refresh[_-]?tokens?|client[_-]?secrets?|private[_-]?keys?|tokens?|credentials?)\b(\s*[:=]\s*)(["']?)([^\s"',;]{4,512})\3/gi,
    (m, key, sep, quote, value) =>
      (looksLikeSecretValue(value) ? `${key}${sep}${quote}${mark('SECRET')}${quote}` : m)
  );

  return { text, redactions: [...new Set(found)], count: found.length };
}

/**
 * Convenience wrapper for API routes: returns the safe text and logs the TYPES
 * that were stripped (never the values), so redaction is observable in ops.
 */
export function redactForLlm(input, context = '') {
  const { text, redactions, count } = redactSecrets(input);
  if (count > 0) {
    console.warn(`[redact] stripped ${count} secret(s)${context ? ` in ${context}` : ''}: ${redactions.join(', ')}`);
  }
  return text;
}
