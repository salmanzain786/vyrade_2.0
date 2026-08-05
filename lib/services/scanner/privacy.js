/**
 * Privacy Analysis Layer (Phase 2) over the shared WorkflowModel.
 *
 * Rules/keyword-based (not a full NLP classifier, per the spec). Works across
 * both platforms because it reads the normalized model — but the third-party
 * PROCESSOR table (2.4) carries BOTH n8n node-type and Make module identifiers,
 * since the same destination service is named differently in each.
 */
import { SEVERITY, finding } from './model.js';

// Collect object KEYS (field names) + string VALUES in one bounded pass. Field
// names are the strongest PII signal; values catch `{{1.email}}`-style mappings.
function walk(obj, keys = [], vals = [], depth = 0) {
  if (depth > 8 || keys.length + vals.length > 1200) return { keys, vals };
  if (typeof obj === 'string') vals.push(obj);
  else if (Array.isArray(obj)) for (const v of obj) walk(v, keys, vals, depth + 1);
  else if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) { keys.push(k); walk(v, keys, vals, depth + 1); }
  }
  return { keys, vals };
}
// Field names use snake_case / kebab / camelCase — normalise to spaced words so
// `\bphone\b` matches `phone_number`, `dateOfBirth`, `patient-id`, etc.
const normalize = (s) => String(s).replace(/[_\-.]+/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2');
const matchesAny = (strings, re) => strings.some((s) => re.test(normalize(s)));

// ── 2.1 PII field detection ──────────────────────────────────────────────────
const PII_PATTERNS = [
  ['email', /e-?mail/i],
  ['phone', /\bphone\b|mobile.?(number|no)|telephone|msisdn/i],
  ['national id / SSN', /\bssn\b|social.?security|national.?id|\bnino\b|aadhaar|passport|tax.?id/i],
  ['address', /\baddress\b|street|postal.?code|zip.?code|postcode/i],
  ['date of birth', /\bdob\b|date.?of.?birth|birth.?date|birthday/i],
  ['full name', /first.?name|last.?name|full.?name|surname|given.?name/i],
  ['payment card', /card.?number|\bcvv\b|\bccv\b|credit.?card|cardholder/i],
  ['IP address', /ip.?address|\bipaddr\b/i],
];

export function detectPII(model) {
  const out = [];
  for (const node of model.nodes) {
    const { keys, vals } = walk(node.parameters);
    const strings = [...keys, ...vals];
    const cats = PII_PATTERNS.filter(([, re]) => matchesAny(strings, re)).map(([c]) => c);
    if (cats.length) {
      const external = node.isHttp || node.app;
      out.push(finding({
        type: 'pii_detected', severity: SEVERITY.MEDIUM,
        title: `Personal data handled: ${cats.join(', ')}`,
        detail: `Node "${node.name}" references personal-information fields (${cats.join(', ')})${external ? ' and sends data to an external service' : ''}.`,
        node: node.name,
        remediation: 'Confirm a lawful basis, minimise the fields, and ensure the destination is a vetted processor.',
      }));
    }
  }
  return out;
}

// ── 2.2 Special-category / health data (higher severity) ─────────────────────
const SPECIAL_PATTERNS = [
  ['health / medical', /\bhealth\b|medical|diagnos|patient|prescription|clinical|treatment|symptom|\bphi\b/i],
  ['biometric', /biometric|fingerprint|facial.?recognition|voiceprint|\biris\b/i],
  ['genetic', /genetic|\bdna\b|genom/i],
  ['mental health', /mental.?health|psychiatr|\bdepression\b/i],
  ['ethnicity / race', /ethnicit|racial/i],
  ['religion', /religio/i],
  ['sexual orientation', /sexual.?orientation|\blgbtq?\b/i],
  ['criminal record', /criminal.?record|conviction/i],
];

export function detectSpecialCategory(model) {
  const out = [];
  for (const node of model.nodes) {
    const { keys, vals } = walk(node.parameters);
    const strings = [...keys, ...vals];
    const cats = SPECIAL_PATTERNS.filter(([, re]) => matchesAny(strings, re)).map(([c]) => c);
    if (cats.length) {
      out.push(finding({
        type: 'special_category_data', severity: SEVERITY.HIGH,
        title: `Special-category data: ${cats.join(', ')}`,
        detail: `Node "${node.name}" appears to handle special-category / health data (${cats.join(', ')}) — higher risk under GDPR Art. 9 / HIPAA.`,
        node: node.name, manualReview: true,
        remediation: 'Confirm an explicit lawful basis (e.g. explicit consent / HIPAA authorization), stronger access controls, and a DPA/BAA with any processor.',
      }));
    }
  }
  return out;
}

// ── 2.3 Data minimisation / purpose limitation (manual-review heuristic) ─────
const MIN_FIELDS = 10; // more mapped fields than this to an external service → review
export function detectDataMinimisation(model) {
  const out = [];
  for (const node of model.nodes) {
    if (!(node.isHttp || node.app)) continue; // only outbound/external destinations
    const { vals } = walk(node.parameters);
    const mapped = vals.filter((s) => s.includes('{{') || s.includes('$json') || s.includes('$node')).length;
    if (mapped > MIN_FIELDS) {
      out.push(finding({
        type: 'data_minimisation', severity: SEVERITY.LOW,
        title: 'Possible over-collection (data minimisation)',
        detail: `Node "${node.name}" maps ~${mapped} fields to an external service — confirm every field is actually necessary for the purpose.`,
        node: node.name, manualReview: true,
        remediation: 'Drop fields the destination does not need; pass only the minimum required (GDPR data-minimisation / purpose-limitation).',
      }));
    }
  }
  return out;
}

// ── 2.4 Retention / cross-border / third-party processor ─────────────────────
// `match` is tested against a node's type + app + shortType, so it catches BOTH
// n8n identifiers (n8n-nodes-base.slack / app "Slack") and Make module ids
// (slack:CreateMessage / app "slack").
const PROCESSORS = [
  { name: 'Slack', category: 'messaging', region: 'US', match: /slack/i },
  { name: 'Salesforce', category: 'CRM', region: 'US', match: /salesforce/i },
  { name: 'HubSpot', category: 'CRM', region: 'US', match: /hubspot/i },
  { name: 'Google Workspace', category: 'productivity/storage', region: 'US', match: /google(sheets|drive|docs|email|calendar|-)|gmail/i },
  { name: 'Microsoft 365', category: 'productivity', region: 'US', match: /microsoft|outlook|onedrive|sharepoint|office365/i },
  { name: 'Mailchimp', category: 'email marketing', region: 'US', match: /mailchimp/i },
  { name: 'SendGrid', category: 'email', region: 'US', match: /sendgrid/i },
  { name: 'AWS', category: 'cloud/storage', region: 'US', match: /\baws\b|amazons3|\bs3\b|dynamodb|\bsns\b|\bsqs\b/i },
  { name: 'Stripe', category: 'payments', region: 'US', match: /stripe/i },
  { name: 'OpenAI', category: 'AI', region: 'US', match: /openai|gpt/i },
  { name: 'Notion', category: 'productivity', region: 'US', match: /notion/i },
  { name: 'Airtable', category: 'database', region: 'US', match: /airtable/i },
  { name: 'Twilio', category: 'communications', region: 'US', match: /twilio/i },
  { name: 'Zendesk', category: 'support', region: 'US', match: /zendesk/i },
  { name: 'Shopify', category: 'e-commerce', region: 'Canada', match: /shopify/i },
];

export function detectProcessors(model) {
  const seen = new Map(); // name -> { processor, node }
  for (const node of model.nodes) {
    const hay = `${node.type} ${node.app || ''} ${node.shortType}`;
    for (const p of PROCESSORS) {
      if (p.match.test(hay) && !seen.has(p.name)) seen.set(p.name, { p, node: node.name });
    }
  }
  return [...seen.values()].map(({ p, node }) => finding({
    type: 'third_party_processor', severity: SEVERITY.LOW,
    title: `Third-party processor: ${p.name}`,
    detail: `Data flows to ${p.name} (${p.category}, ${p.region}-based) via node "${node}". If the workflow handles EU/UK personal data this is an international transfer — and the processor's retention applies once data leaves.`,
    node, manualReview: true,
    remediation: `Confirm a DPA with ${p.name}, an appropriate transfer mechanism (SCCs/adequacy) for cross-border flows, the retention terms, and that you can fulfil data-subject deletion/access (DSAR) requests for data sent here.`,
  }));
}

// ── 2.5 Consent-dependent actions (manual-review heuristic) ──────────────────
// DECISION: Phase 2 owns the GENERIC heuristic (a consent-relevant channel send
// with no visible consent gate → review); Phase 6 owns the POLICY-explicit
// version ("consent required before X" declared on the Blueprint). Fully
// automating "is this marketing AND consent-dependent AND ungated" is three
// inferential steps, so this is a manual-review flag, not a pass/fail.
const CONSENT_CHANNEL_RE = /mailchimp|sendgrid|klaviyo|activecampaign|convertkit|customer\.?io|sendinblue|brevo|mailjet|constantcontact|iterable|\bdrip\b|twilio|vonage|nexmo|messagebird|plivo|whatsapp/i;
const CONSENT_SIGNAL_RE = /consent|opt.?in|opted.?in|subscribed|subscription.?status|marketing.?(consent|preference|permission)|gdpr.?consent|has.?consent|double.?opt|permission.?to.?(email|contact|market)/i;

function isConsentChannelSend(node) {
  return CONSENT_CHANNEL_RE.test(`${node.type} ${node.app || ''} ${node.shortType}`);
}

export function detectConsent(model) {
  const sends = model.nodes.filter(isConsentChannelSend);
  if (!sends.length) return [];
  // A consent gate anywhere in the workflow (a field/condition referencing
  // consent/opt-in/subscribed) is enough to suppress the flag.
  const hasConsentGate = model.nodes.some((n) => {
    const { keys, vals } = walk(n.parameters);
    return matchesAny([...keys, ...vals], CONSENT_SIGNAL_RE) || CONSENT_SIGNAL_RE.test(normalize(n.name));
  });
  if (hasConsentGate) return [];
  return sends.map((node) => finding({
    type: 'consent_dependent_action', severity: SEVERITY.MEDIUM,
    title: 'Marketing/comms send without a visible consent check',
    detail: `Node "${node.name}" sends over a consent-relevant channel (marketing email / SMS), but no upstream consent/opt-in gate is visible — sending without prior consent risks GDPR/PECR/TCPA issues.`,
    node: node.name, manualReview: true,
    remediation: 'Add a consent/opt-in gate before the send (check a subscribed/consented flag), or record on the Blueprint that consent is enforced upstream (Phase 6).',
  }));
}

// ── 2.6 Logging of sensitive information (its own elevated-risk case) ────────
// PII/special-category data written to a LOG/AUDIT sink persists longer and is
// visible to more people than the primary datastore — so it's flagged more
// strongly than the same data going to a normal service (2.1/2.2).
const LOG_SERVICE_RE = /datadog|loggly|papertrail|logtail|splunk|elasticsearch|logstash|kibana|graylog|sematext|betterstack|newrelic|new-relic|cloudwatch|coralogix|\bsyslog\b|\baxiom\b/i;
const LOG_NAME_RE = /\b(logs?|logging|audit|audit.?trail|event.?log)\b/i;
const STORE_RE = /googlesheets|\bsheets\b|airtable|postgres|mysql|mongodb|\bsql\b|\bs3\b|bigquery|snowflake|notion|baserow|nocodb/i;

/** PII + special-category categories referenced by a single node. */
function sensitiveCats(node) {
  const { keys, vals } = walk(node.parameters);
  const strings = [...keys, ...vals];
  return {
    pii: PII_PATTERNS.filter(([, re]) => matchesAny(strings, re)).map(([c]) => c),
    special: SPECIAL_PATTERNS.filter(([, re]) => matchesAny(strings, re)).map(([c]) => c),
    logsWholePayload: vals.some((v) => /\{\{\s*\$?json\s*\}\}/i.test(v)),
  };
}

function isLogSink(node) {
  const hay = `${node.type} ${node.app || ''} ${node.shortType}`;
  if (LOG_SERVICE_RE.test(hay)) return true;                 // a logging/observability service
  if (LOG_NAME_RE.test(normalize(node.name))) return true;   // node named like a log/audit step
  if (STORE_RE.test(hay)) {                                  // a store whose target is named like a log
    const { vals } = walk(node.parameters);
    if (vals.some((v) => LOG_NAME_RE.test(normalize(v)))) return true;
  }
  return false;
}

export function detectSensitiveLogging(model) {
  const out = [];
  const workflowHasPII = model.nodes.some((n) => { const c = sensitiveCats(n); return c.pii.length || c.special.length; });

  for (const node of model.nodes) {
    if (!isLogSink(node)) continue;
    const { pii, special, logsWholePayload } = sensitiveCats(node);

    if (special.length) {
      out.push(finding({
        type: 'sensitive_logging', severity: SEVERITY.CRITICAL,
        title: `Special-category data written to a log/audit sink: ${special.join(', ')}`,
        detail: `Sink "${node.name}" records special-category data (${special.join(', ')}). Logs persist and are broadly accessible — this sharply raises the exposure over storing it in the primary datastore.`,
        node: node.name,
        remediation: 'Never log special-category data — redact/exclude these fields before the sink.',
      }));
    } else if (pii.length) {
      out.push(finding({
        type: 'sensitive_logging', severity: SEVERITY.HIGH,
        title: `Personal data written to a log/audit sink: ${pii.join(', ')}`,
        detail: `Sink "${node.name}" logs personal data (${pii.join(', ')}). Logs typically live longer and are seen by more people than the primary store.`,
        node: node.name,
        remediation: 'Redact/omit PII before logging, or log an opaque id instead of the raw values.',
      }));
    } else if (workflowHasPII && logsWholePayload) {
      out.push(finding({
        type: 'sensitive_logging', severity: SEVERITY.MEDIUM,
        title: 'Log/audit sink may capture personal data',
        detail: `Sink "${node.name}" logs the whole payload while the workflow handles personal data — confirm PII isn't written to logs.`,
        node: node.name, manualReview: true,
        remediation: 'Log only the fields you need, redact PII, and confirm the sink’s retention/access.',
      }));
    }
  }
  return out;
}

// ── 2.7 Data retention (its own check; generic here, policy limits → Phase 6) ─
// DECISION (same split as retry/consent): Phase 2 flags what's structurally
// inferable — the workflow persists PERSONAL data but shows no deletion/expiry
// mechanism. Phase 6 owns the policy-specific limit ("retain 90 days then
// delete") and deletion/access (DSAR) requirements declared on the Blueprint.
const PERSIST_STORE_RE = /googlesheets|\bsheets\b|airtable|postgres|mysql|mariadb|mongodb|\bsql\b|\bs3\b|bigquery|snowflake|notion|baserow|nocodb|dynamodb|supabase|firebase|firestore/i;
const WRITE_OP_RE = /create|insert|append|\badd\b|write|upsert|\bput\b|store|save/i;
const READ_OP_RE = /\bget\b|list|search|read|select|find|lookup|fetch|retrieve|query|download/i;
const DELETE_OP_RE = /delete|remove|purge|cleanup|clear|\bdrop\b|truncate|expire|prune/i;
const TTL_RE = /\bttl\b|time.?to.?live|expir(e|y|ation)|retention|delete.?after|auto.?delete/i;

const opOf = (node) => String(node.parameters?.operation || node.parameters?.action || node.parameters?.mode || '').toLowerCase();

function isPersistentWrite(node) {
  if (!PERSIST_STORE_RE.test(`${node.type} ${node.app || ''} ${node.shortType}`)) return false;
  const op = opOf(node);
  if (op && READ_OP_RE.test(op) && !WRITE_OP_RE.test(op)) return false; // clearly a read
  return true;
}

function hasDeletionMechanism(model) {
  return model.nodes.some((n) => {
    if (DELETE_OP_RE.test(opOf(n)) || DELETE_OP_RE.test(normalize(n.name))) return true;
    const { keys, vals } = walk(n.parameters);
    return [...keys, ...vals].some((s) => TTL_RE.test(normalize(s)));
  });
}

export function detectRetention(model) {
  const stores = model.nodes.filter(isPersistentWrite);
  if (!stores.length) return [];
  // Gate on personal data — retention is a privacy concern for PII specifically.
  const handlesPII = model.nodes.some((n) => { const c = sensitiveCats(n); return c.pii.length || c.special.length; });
  if (!handlesPII || hasDeletionMechanism(model)) return [];

  const names = [...new Set(stores.map((s) => s.name))];
  return [finding({
    type: 'no_retention_control', severity: SEVERITY.LOW,
    title: 'Personal data stored with no visible retention/deletion mechanism',
    detail: `The workflow writes personal data to a persistent store (${names.slice(0, 3).join(', ')}${names.length > 3 ? ', …' : ''}) but has no visible deletion, expiry/TTL, or cleanup step — data can accumulate indefinitely.`,
    node: names.length === 1 ? names[0] : null, manualReview: true,
    remediation: 'Confirm a retention policy and add a deletion/expiry mechanism (scheduled cleanup or TTL). A specific limit ("retain N days") can be declared on the Blueprint and enforced in Phase 6.',
  })];
}

// ── Deletion & access requirements (DSAR / data-subject rights) → PHASE 6 ────
// DECISION (documented, not deferred silently): this is NOT implemented in
// Phase 2 and is owned ENTIRELY by Phase 6 (Blueprint policy comparison).
// Rationale: unlike retention (which has a structural signal — "stores PII with
// no deletion step"), whether the ORG can fulfil a GDPR/CCPA deletion or access
// request is a cross-system organizational capability, not inferable from one
// workflow's structure. There is therefore no Phase 2 heuristic; the Blueprint
// declares the DSAR handling and Phase 6's diff engine checks the workflow
// against it (same home as retry limits). The `third_party_processor` finding
// (2.4) already points at DSAR as a consideration for data leaving to a
// processor.
export const PRIVACY_DETECTORS = [detectPII, detectSpecialCategory, detectDataMinimisation, detectProcessors, detectConsent, detectSensitiveLogging, detectRetention];
