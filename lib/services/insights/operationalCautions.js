/**
 * Operational Insights — curated caution seed (moat layer 3).
 *
 * The third retrieval source, alongside workflow examples and node knowledge:
 * "what goes wrong in production and how to avoid it." Unlike the other two,
 * cautions match best by EXACT integration / action, not semantic similarity —
 * so this is a keyed lookup, not a Pinecone index.
 *
 * This file is the hand-authored SEED (useful on day 1, zero telemetry needed).
 * Real run/failure telemetry (topFailingNodes / docGaps) is merged on top at
 * retrieval time in cautionRetrieval.js, so the layer self-improves with usage.
 *
 * Each entry is deterministic guidance — never a raw error, never PII.
 */

const CAT = { RATE: 'rate_limit', AUTH: 'auth', SCHEMA: 'schema', RELIABILITY: 'reliability', DATA: 'data' };

/**
 * aliases  — integration/system names this caution applies to (matched against
 *            Blueprint system names, both-ways substring, case-insensitive).
 * actions  — Blueprint action_types this caution applies to (optional).
 * Keep `caution` to the failure mode and `fix` to the mitigation.
 */
export const CURATED_CAUTIONS = [
  // ── Messaging / notifications ──────────────────────────────────────────
  { id: 'slack', aliases: ['slack'], severity: 'warning', category: CAT.RATE,
    caution: 'Slack rate-limits chat.postMessage (~1 msg/sec/channel) and silently drops over-posting.',
    fix: 'Post to a channel ID (not a name), batch messages, and add a short delay when looping.' },
  { id: 'discord', aliases: ['discord'], severity: 'info', category: CAT.RATE,
    caution: 'Discord webhooks are rate-limited and cap messages at 2000 characters.',
    fix: 'Chunk long content and respect 429 Retry-After headers.' },
  { id: 'telegram', aliases: ['telegram'], severity: 'info', category: CAT.RATE,
    caution: 'Telegram bots are limited to ~30 messages/second and need a numeric chat_id.',
    fix: 'Resolve and store chat_id; throttle bulk sends.' },
  { id: 'twilio', aliases: ['twilio', 'sms'], severity: 'warning', category: CAT.DATA,
    caution: 'Twilio requires E.164 phone numbers and enforces per-number messaging limits.',
    fix: 'Normalise numbers to +<country><number>; handle queued/failed status callbacks.' },

  // ── Google workspace ───────────────────────────────────────────────────
  { id: 'gsheets', aliases: ['google sheets', 'sheets', 'gsheet', 'spreadsheet'], severity: 'warning', category: CAT.SCHEMA,
    caution: 'Google Sheets fails if the target spreadsheet/tab does not exist, and confuses append vs. update.',
    fix: 'Ensure the sheet+tab exist first; pick Append for new rows, Update for existing; respect the ~60 req/min/user quota.' },
  { id: 'gmail', aliases: ['gmail', 'google mail'], severity: 'warning', category: CAT.AUTH,
    caution: 'Gmail needs the right OAuth scope and enforces daily send limits; replies need the threadId.',
    fix: 'Use send/modify scopes; capture threadId for replies; back off on 429.' },
  { id: 'gdrive', aliases: ['google drive', 'gdrive', 'drive'], severity: 'info', category: CAT.AUTH,
    caution: 'Drive operations use file IDs (not names) and can time out on large files or shared-drive permissions.',
    fix: 'Look up and store file IDs; set supportsAllDrives; stream large files.' },

  // ── Productivity / CRM ─────────────────────────────────────────────────
  { id: 'notion', aliases: ['notion'], severity: 'warning', category: CAT.SCHEMA,
    caution: 'Notion rejects writes whose property TYPES do not match the database schema; API is ~3 req/s.',
    fix: 'Match each property to its schema type (title/rich_text/select…); paginate; throttle.' },
  { id: 'airtable', aliases: ['airtable'], severity: 'warning', category: CAT.RATE,
    caution: 'Airtable allows ~5 req/s per base and has case-sensitive field names; selects need typecast.',
    fix: 'Use exact field names, set typecast:true for single/multi-select, and throttle to 5 req/s.' },
  { id: 'hubspot', aliases: ['hubspot'], severity: 'info', category: CAT.SCHEMA,
    caution: 'HubSpot uses internal property names (not labels) and separate association calls.',
    fix: 'Map to internal property names; create associations explicitly; mind the 100 req/10s cap.' },
  { id: 'salesforce', aliases: ['salesforce', 'sfdc'], severity: 'warning', category: CAT.RELIABILITY,
    caution: 'Salesforce enforces org API limits and rejects records missing required fields.',
    fix: 'Populate required fields, prefer Bulk API for volume, and handle daily-limit errors.' },

  // ── Commerce / payments ────────────────────────────────────────────────
  { id: 'stripe', aliases: ['stripe'], severity: 'error', category: CAT.RELIABILITY,
    caution: 'Stripe amounts are in the smallest currency unit (cents), and retries without idempotency keys double-charge.',
    fix: 'Send amounts in cents, set an Idempotency-Key on writes, and verify webhook signatures.' },
  { id: 'shopify', aliases: ['shopify'], severity: 'warning', category: CAT.RATE,
    caution: 'Shopify REST uses a leaky-bucket limit (~2 req/s) and paginates via the Link header.',
    fix: 'Throttle to the bucket, follow Link rel="next" for pagination, and retry on 429.' },
  { id: 'quickbooks', aliases: ['quickbooks', 'qbo'], severity: 'info', category: CAT.AUTH,
    caution: 'QuickBooks Online tokens expire hourly and require realmId on every call.',
    fix: 'Refresh the OAuth token proactively; pass realmId; handle throttling.' },

  // ── Data stores ────────────────────────────────────────────────────────
  { id: 'db', aliases: ['postgres', 'postgresql', 'mysql', 'mariadb', 'database', 'sql'], severity: 'error', category: CAT.RELIABILITY,
    caution: 'Direct DB nodes are prone to SQL injection via string-built queries and can exhaust the connection pool.',
    fix: 'Use parameterised queries only; keep connections short; wrap multi-step writes in a transaction.' },
  { id: 'mongo', aliases: ['mongodb', 'mongo'], severity: 'info', category: CAT.DATA,
    caution: 'MongoDB upserts silently create documents and are easy to mis-filter.',
    fix: 'Scope filters precisely; set upsert deliberately; index the query field.' },

  // ── Generic protocol nodes ─────────────────────────────────────────────
  { id: 'http', aliases: ['http', 'http request', 'rest', 'api'], actions: ['http_request', 'api_call', 'fetch_data'], severity: 'warning', category: CAT.RELIABILITY,
    caution: 'Raw HTTP Request nodes assume 2xx, ignore pagination, and hang without a timeout.',
    fix: 'Handle non-2xx explicitly, add timeout + retry with backoff, and follow pagination (cursor/Link/page).' },
  { id: 'webhook', aliases: ['webhook'], actions: ['receive_data', 'receive_webhook', 'trigger'], severity: 'warning', category: CAT.RELIABILITY,
    caution: 'Webhook triggers must respond fast, and senders retry — causing duplicate executions.',
    fix: 'Respond 200 immediately, validate the payload, and dedupe on an idempotency/event id.' },
  { id: 'smtp', aliases: ['smtp', 'email', 'mailer', 'sendgrid', 'mailgun'], actions: ['send_email'], severity: 'info', category: CAT.AUTH,
    caution: 'SMTP/email sending fails on missing app-passwords and lands in spam without SPF/DKIM.',
    fix: 'Use an app password or API key, set a verified From domain with SPF/DKIM, and throttle bulk sends.' },

  // ── AI / LLM steps (action-keyed) ──────────────────────────────────────
  { id: 'ai', aliases: ['openai', 'anthropic', 'claude', 'gpt', 'llm', 'gemini'], actions: ['ai_reasoning', 'generate_content', 'classify', 'summarize'], severity: 'warning', category: CAT.RELIABILITY,
    caution: 'LLM nodes hit token/context limits, are rate-limited, and can return non-JSON when JSON is expected.',
    fix: 'Cap input size, add retry/backoff on 429, request structured output, and add an error branch for bad responses.' },
];

const norm = (s) => String(s || '').toLowerCase().trim();

// Both-ways substring so "Google Sheets" matches alias "sheets" and vice-versa.
function aliasHit(toolName, aliases) {
  const t = norm(toolName);
  if (!t) return false;
  return aliases.some((a) => {
    const al = norm(a);
    return al.length >= 3 && (t.includes(al) || al.includes(t));
  });
}

/**
 * Select curated cautions relevant to a Blueprint's integrations + actions.
 * @param {{tools?: string[], actionTypes?: string[]}} sig
 * @returns {Array<{id,severity,category,caution,fix,source}>}
 */
export function selectCautions({ tools = [], actionTypes = [] } = {}) {
  const acts = new Set(actionTypes.map(norm));
  const out = [];
  const seen = new Set();
  for (const c of CURATED_CAUTIONS) {
    const byTool = tools.some((t) => aliasHit(t, c.aliases));
    const byAction = (c.actions || []).some((a) => acts.has(norm(a)));
    if ((byTool || byAction) && !seen.has(c.id)) {
      seen.add(c.id);
      out.push({ id: c.id, severity: c.severity, category: c.category, caution: c.caution, fix: c.fix, source: 'curated' });
    }
  }
  return out;
}

/** Render cautions as a compact, prompt-ready block. */
export function formatCautions(cautions = []) {
  if (!cautions.length) return '(no known operational cautions for these integrations)';
  return cautions
    .map((c) => `- [${c.category}] ${c.caution}\n  Fix: ${c.fix}`)
    .join('\n');
}

export default { CURATED_CAUTIONS, selectCautions, formatCautions };
