/**
 * Sensitive-data handling on ingest (Work Intelligence, Phase 1.5).
 *
 * REUSES the scanner/analytics redaction utilities rather than reinventing them:
 * `redactSecrets` strips secrets; on top we strip emails/PII (per the
 * connection's sensitive-data rules) and HASH assignee identities so stored task
 * content can drive automation discovery WITHOUT retaining who did what
 * (governance: "personal performance is not inferred").
 */
import { createHmac } from 'crypto';
import { redactSecrets } from '../../security/redact.js';

const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const PHONE_RE = /\b(?:\+?\d[\d\s().-]{7,}\d)\b/g;

/** Stable, non-reversible reference for an assignee (HMAC — never store raw email/id). */
export function hashRef(ref) {
  if (!ref) return null;
  const secret = process.env.WORK_INTEL_KEY || process.env.AUTH_SECRET || 'dev';
  return createHmac('sha256', secret).update(String(ref)).digest('hex').slice(0, 24);
}

/** Redact a free-text field: secrets always; emails/phones when rules ask. */
export function sanitizeText(text, rules = {}) {
  if (!text) return { text: '', types: [] };
  const { text: noSecrets, redactions } = redactSecrets(String(text));
  let out = noSecrets;
  const types = [...redactions];
  if (rules.redact_emails !== false) {
    if (EMAIL_RE.test(out)) { out = out.replace(EMAIL_RE, '[REDACTED_EMAIL]'); types.push('EMAIL'); }
    EMAIL_RE.lastIndex = 0;
    if (PHONE_RE.test(out)) { out = out.replace(PHONE_RE, '[REDACTED_PHONE]'); types.push('PHONE'); }
    PHONE_RE.lastIndex = 0;
  }
  return { text: out, types: [...new Set(types)] };
}

/**
 * Turn a normalized task (taskModel) into a STORAGE-SAFE record per the scope's
 * sensitive rules. Returns the redacted record + the set of redaction types
 * applied (observability), and never includes raw emails or assignee identities.
 */
export function sanitizeTaskForStorage(task, rules = {}) {
  const types = new Set();
  const collect = (r) => r.types.forEach((t) => types.add(t));

  const name = sanitizeText(task.name, rules); collect(name);
  const description = sanitizeText(task.description, rules); collect(description);

  const checklist = (task.checklist || []).map((c) => {
    const cn = sanitizeText(c.name, rules); collect(cn);
    return { name: cn.text, items: (c.items || []).map((i) => { const it = sanitizeText(i.name, rules); collect(it); return { name: it.text, resolved: i.resolved }; }) };
  });

  const customFields = {};
  if (rules.__include_custom_fields) {
    for (const [k, v] of Object.entries(task.custom_fields || {})) {
      if (typeof v === 'string') { const r = sanitizeText(v, rules); collect(r); customFields[k] = r.text; }
      else customFields[k] = v;
    }
  }

  // Phase 2.2 — comments/attachments only when the field is opted in (scope).
  const comments = rules.__include_comments
    ? (task.comments || []).map((c) => { const r = sanitizeText(c.text, rules); collect(r); return { text: r.text, at: c.at }; }).filter((c) => c.text)
    : [];
  const attachments = rules.__include_attachments
    ? (task.attachments || []).map((a) => { const n = sanitizeText(a.name, rules); const u = sanitizeText(a.url || '', rules); collect(n); collect(u); return { name: n.text, url: u.text || null }; })
    : [];

  return {
    external_id: task.external_id,
    name: name.text,
    description: description.text,
    status: task.status,
    status_type: task.status_type,
    project: task.project,
    list: task.list,
    space_id: task.space_id,
    parent_id: task.parent_id,
    subtask_count: task.subtask_count,
    comment_count: task.comment_count,
    attachment_count: task.attachment_count,
    checklist,
    tags: task.tags,
    recurrence: task.recurrence,
    due_date: task.due_date,
    created_at: task.created_at,
    updated_at: task.updated_at,
    custom_fields: customFields,
    url: task.url,
    comments,
    attachments,
    related_ids: task.related_ids || [],
    // Identity: only HASHED refs — never the raw email/name/id.
    assignee_refs: (task.assignees || []).map((a) => hashRef(a.ref || a.email)).filter(Boolean),
    assignee_count: (task.assignees || []).length,
    redaction_types: [...types],
  };
}

export default { sanitizeText, sanitizeTaskForStorage, hashRef };
