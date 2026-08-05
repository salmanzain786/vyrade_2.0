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
    remediation: `Confirm a DPA with ${p.name}, an appropriate transfer mechanism (SCCs/adequacy) for cross-border flows, and the retention terms.`,
  }));
}

export const PRIVACY_DETECTORS = [detectPII, detectSpecialCategory, detectDataMinimisation, detectProcessors];
