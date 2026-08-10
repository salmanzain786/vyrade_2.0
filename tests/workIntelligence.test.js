import { describe, it, expect } from 'vitest';
import { encryptToken, decryptToken } from '../lib/services/work-intelligence/tokenCrypto.js';
import { normalizeTask } from '../lib/services/work-intelligence/taskModel.js';
import { sanitizeText, sanitizeTaskForStorage, hashRef } from '../lib/services/work-intelligence/sanitizer.js';
import { normalizeScope, DEFAULT_SCOPE, isProjectInScope } from '../lib/services/work-intelligence/scope.js';
import { normalizeGovernance, retentionExpiry, requiresEmployeeOptIn, RETENTION_DEFAULT_DAYS } from '../lib/services/work-intelligence/governance.js';

describe('token crypto (1.1) — tokens are never stored plaintext', () => {
  it('round-trips a token through AES-256-GCM', () => {
    const secret = 'clickup_access_token_abc123';
    const enc = encryptToken(secret);
    expect(enc).not.toBe(secret);
    expect(enc.split(':')).toHaveLength(3);       // iv:tag:ciphertext
    expect(decryptToken(enc)).toBe(secret);
  });
  it('returns null for empty input and tampered ciphertext', () => {
    expect(encryptToken('')).toBeNull();
    expect(decryptToken('garbage')).toBeNull();
    const enc = encryptToken('x');
    expect(decryptToken(enc.slice(0, -4) + 'AAAA')).toBeNull(); // auth tag fails
  });
});

describe('ClickUp normalization (1.2)', () => {
  const raw = {
    id: '86a1', name: 'Monthly SEO reporting', text_content: 'Prepare the report',
    status: { status: 'in progress', type: 'custom' },
    assignees: [{ id: 42, username: 'Sam', email: 'sam@acme.com' }],
    date_created: '1700000000000', due_date: '1701000000000',
    tags: [{ name: 'reporting' }], list: { name: 'SEO' }, space: { id: '9' }, project: { name: 'Client A' },
    checklists: [{ name: 'Steps', items: [{ name: 'Export GA4', resolved: true }, { name: 'Draft summary', resolved: false }] }],
    subtasks: [{ id: 'x' }], comment_count: 3, url: 'https://app.clickup.com/t/86a1',
  };
  it('maps into the normalized model', () => {
    const t = normalizeTask('clickup', raw);
    expect(t.external_id).toBe('86a1');
    expect(t.name).toBe('Monthly SEO reporting');
    expect(t.status).toBe('in progress');
    expect(t.project).toBe('Client A');
    expect(t.subtask_count).toBe(1);
    expect(t.checklist[0].items).toHaveLength(2);
    expect(t.assignees[0].email).toBe('sam@acme.com');
    expect(t.created_at).toMatch(/^20/); // ISO
  });
  it('throws for an unknown platform', () => {
    expect(() => normalizeTask('trello', {})).toThrow(/No task mapper/);
  });
});

describe('sensitive-data handling (1.5)', () => {
  it('redacts secrets and emails, and never keeps raw assignee identity', () => {
    const task = normalizeTask('clickup', {
      id: '1', name: 'Sync with api_key=sk_live_ABCDEF1234567890', text_content: 'ping sam@acme.com about it',
      assignees: [{ id: 7, email: 'sam@acme.com', username: 'Sam' }], checklists: [], status: { status: 'open' },
    });
    const s = sanitizeTaskForStorage(task, { redact_emails: true, redact_secrets: true });
    expect(s.name).toContain('[REDACTED_');           // secret stripped
    expect(s.name).not.toMatch(/sk_live/);
    expect(s.description).toContain('[REDACTED_EMAIL]');
    expect(s.description).not.toMatch(/sam@acme\.com/);
    expect(s.assignee_refs.every((r) => !/@/.test(r))).toBe(true); // hashed, no raw email
    expect(s.assignee_count).toBe(1);
    expect(s.redaction_types).toEqual(expect.arrayContaining(['EMAIL']));
  });
  it('hashRef is stable + non-reversible-looking', () => {
    expect(hashRef('sam@acme.com')).toBe(hashRef('sam@acme.com'));
    expect(hashRef('sam@acme.com')).not.toContain('sam');
    expect(hashRef(null)).toBeNull();
  });
  it('sanitizeText leaves clean text intact', () => {
    expect(sanitizeText('Prepare monthly report', {}).text).toBe('Prepare monthly report');
  });
});

describe('fuller context capture (2.2) — opt-in only', () => {
  const rawWithExtras = {
    id: 't9', name: 'Client onboarding', status: { status: 'open' },
    comments: [{ comment_text: 'ping the client at bob@acme.com', date: '1700000000000' }],
    attachments: [{ title: 'contract.pdf', url: 'https://files.example.com/c.pdf' }],
    linked_tasks: [{ task_id: 'rel1' }], dependencies: [{ task_id: 'rel2' }],
  };

  it('normalizes comments, attachments, and related task ids from the payload', () => {
    const t = normalizeTask('clickup', rawWithExtras);
    expect(t.comments[0].text).toMatch(/ping the client/);
    expect(t.attachments[0]).toEqual({ name: 'contract.pdf', url: 'https://files.example.com/c.pdf' });
    expect(t.related_ids.sort()).toEqual(['rel1', 'rel2']);
  });

  it('stores comments/attachments ONLY when the field is opted in — default OFF keeps them out', () => {
    const t = normalizeTask('clickup', rawWithExtras);
    const off = sanitizeTaskForStorage(t, { redact_emails: true });                 // fields not opted in
    expect(off.comments).toEqual([]);
    expect(off.attachments).toEqual([]);
    const on = sanitizeTaskForStorage(t, { redact_emails: true, __include_comments: true, __include_attachments: true });
    expect(on.comments).toHaveLength(1);
    expect(on.comments[0].text).toContain('[REDACTED_EMAIL]');                       // comment text redacted
    expect(on.comments[0].text).not.toMatch(/bob@acme/);
    expect(on.attachments[0].name).toBe('contract.pdf');
    expect(on.related_ids.sort()).toEqual(['rel1', 'rel2']);                          // ids always safe
  });
});

describe('scope config (1.3) — reads nothing by default', () => {
  it('defaults are conservative: no projects, no write-back, comments/attachments off', () => {
    const s = normalizeScope({});
    expect(s.projects).toEqual([]);
    expect(s.write_back_enabled).toBe(false);
    expect(s.fields.comments).toBe(false);
    expect(s.fields.attachments).toBe(false);
    expect(s.sensitive_rules.analyze_personal_performance).toBe(false);
  });
  it('isProjectInScope requires explicit selection and honours exclusions', () => {
    expect(isProjectInScope(normalizeScope({}), 'p1')).toBe(false);           // nothing selected
    expect(isProjectInScope(normalizeScope({ projects: ['p1'] }), 'p1')).toBe(true);
    expect(isProjectInScope(normalizeScope({ projects: ['p1'], excluded_projects: ['p1'] }), 'p1')).toBe(false);
  });
});

describe('governance & consent (1.4)', () => {
  it('defaults: 90-day retention, managers-only, notify, no performance inference', () => {
    const g = normalizeGovernance({});
    expect(g.retention_days).toBe(RETENTION_DEFAULT_DAYS);
    expect(g.retention_days).toBe(90);
    expect(g.opportunity_visibility).toBe('managers');
    expect(g.employee_notification).toBe('notify');
    expect(g.analyze_personal_performance).toBe(false);
  });
  it('retentionExpiry is retention_days out from now', () => {
    const from = new Date('2026-01-01T00:00:00Z');
    expect(retentionExpiry({ retention_days: 30 }, from).toISOString().slice(0, 10)).toBe('2026-01-31');
  });
  it('requiresEmployeeOptIn reflects consent settings', () => {
    expect(requiresEmployeeOptIn({})).toBe(false);
    expect(requiresEmployeeOptIn({ consent_mode: 'employee_opt_in' })).toBe(true);
    expect(requiresEmployeeOptIn({ employee_notification: 'consent_required' })).toBe(true);
  });
});
