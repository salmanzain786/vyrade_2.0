/**
 * Curated opportunity catalog (Phase 1.2).
 *
 * Deterministic role/department → workflow-area mapping. Chosen over a per-signup
 * LLM call (per the spec): cheaper, deterministic, hand-tunable, and easy to
 * reason about early on. Upgradeable to LLM-personalised later without changing
 * the storage or dashboard.
 *
 * `est_hours_month` is a rough, directional ESTIMATE — surfaced as "estimated"
 * everywhere until Phase 4 telemetry replaces it. Do not present as measured.
 */

// Department keys the profile stores; free-text roles map onto these.
export const DEPARTMENTS = ['marketing', 'sales', 'finance', 'support', 'operations', 'hr', 'it', 'product', 'general'];

export const DEPARTMENT_LABEL = {
  marketing: 'Marketing', sales: 'Sales', finance: 'Finance', support: 'Customer Support',
  operations: 'Operations', hr: 'People / HR', it: 'IT', product: 'Product', general: 'Cross-functional',
};

const A = (key, label, est, complexity, description) => ({ key, label, est_hours_month: est, complexity, description });

// Department → workflow areas. Kept intentionally small & concrete per department.
export const CATALOG = {
  marketing: [
    A('mkt_lead_capture', 'Lead capture & routing', 12, 'no_code', 'Auto-route inbound leads from forms/ads to CRM + owner.'),
    A('mkt_content_repurpose', 'Content repurposing', 10, 'low_code', 'Turn one asset into channel-specific posts automatically.'),
    A('mkt_campaign_reporting', 'Campaign reporting', 8, 'low_code', 'Pull ad/analytics data into a scheduled digest.'),
    A('mkt_social_scheduling', 'Social scheduling & monitoring', 6, 'no_code', 'Queue posts and alert on mentions/keywords.'),
    A('mkt_nurture_email', 'Email nurture sequences', 9, 'low_code', 'Trigger personalised follow-ups from behaviour.'),
  ],
  sales: [
    A('sales_lead_enrichment', 'Lead enrichment', 10, 'api', 'Enrich new leads with firmographic data before outreach.'),
    A('sales_crm_hygiene', 'CRM data hygiene', 8, 'low_code', 'Dedupe, normalise, and flag stale records.'),
    A('sales_quote_followup', 'Quote & proposal follow-up', 7, 'no_code', 'Nudge sequences on unaccepted quotes.'),
    A('sales_meeting_notes', 'Meeting notes → CRM', 6, 'api', 'Summarise calls and log to the opportunity.'),
  ],
  finance: [
    A('fin_invoice_processing', 'Invoice processing', 14, 'api', 'Extract invoice data and file for approval.'),
    A('fin_expense_approval', 'Expense approvals', 8, 'no_code', 'Route expenses through approval + notify.'),
    A('fin_recon_reporting', 'Reconciliation & reporting', 12, 'low_code', 'Assemble recurring finance reports on schedule.'),
    A('fin_ap_reminders', 'AP/AR reminders', 6, 'no_code', 'Chase overdue invoices automatically.'),
  ],
  support: [
    A('sup_ticket_triage', 'Ticket triage & routing', 12, 'low_code', 'Classify and route inbound tickets to the right queue.'),
    A('sup_kb_deflection', 'Knowledge-base deflection', 10, 'api', 'Suggest KB answers before a human replies.'),
    A('sup_csat_followup', 'CSAT & follow-up', 6, 'no_code', 'Send surveys and escalate detractors.'),
    A('sup_escalation_alerts', 'Escalation alerts', 5, 'no_code', 'Alert owners when SLAs are at risk.'),
  ],
  operations: [
    A('ops_onboarding', 'Employee/customer onboarding', 10, 'low_code', 'Coordinate onboarding steps across tools.'),
    A('ops_inventory_sync', 'Inventory / data sync', 9, 'api', 'Keep systems of record in sync.'),
    A('ops_scheduled_reports', 'Scheduled operational reports', 7, 'low_code', 'Compile and distribute recurring reports.'),
    A('ops_approval_flows', 'Approval workflows', 6, 'no_code', 'Standardise request → approve → notify.'),
  ],
  hr: [
    A('hr_recruiting_pipeline', 'Recruiting pipeline', 9, 'low_code', 'Move candidates through stages with notifications.'),
    A('hr_onboarding_tasks', 'Onboarding task automation', 8, 'no_code', 'Provision accounts and assign starter tasks.'),
    A('hr_pto_requests', 'PTO / request routing', 5, 'no_code', 'Route and log time-off requests.'),
  ],
  it: [
    A('it_access_requests', 'Access request automation', 8, 'api', 'Route and record access grants/revocations.'),
    A('it_alert_routing', 'Alert routing & on-call', 7, 'low_code', 'Route monitoring alerts to the right responder.'),
    A('it_asset_tracking', 'Asset tracking', 6, 'low_code', 'Keep an inventory in sync from multiple sources.'),
  ],
  product: [
    A('prod_feedback_triage', 'Feedback triage', 8, 'api', 'Cluster and route product feedback.'),
    A('prod_release_notes', 'Release notes assembly', 5, 'low_code', 'Compile changelog entries into notes.'),
    A('prod_usage_digest', 'Usage digest', 6, 'low_code', 'Summarise product metrics on a schedule.'),
  ],
  general: [
    A('gen_data_entry', 'Data entry & transfer', 8, 'no_code', 'Move data between apps without manual copy/paste.'),
    A('gen_notifications', 'Notifications & alerts', 4, 'no_code', 'Notify the right people when something happens.'),
    A('gen_document_generation', 'Document generation', 6, 'low_code', 'Generate documents from templates + data.'),
    A('gen_scheduled_digests', 'Scheduled digests', 5, 'low_code', 'Assemble and send recurring summaries.'),
  ],
};

// Light role → department inference for the minimum-capture case (role given,
// department not). Keyword match; defaults to 'general'.
const ROLE_HINTS = [
  [/market|brand|growth|seo|content|social/i, 'marketing'],
  [/sales|account exec|\bae\b|\bsdr\b|business develop/i, 'sales'],
  [/financ|account|bookkeep|controller|\bap\b|\bar\b|payroll/i, 'finance'],
  [/support|success|helpdesk|service desk|customer care/i, 'support'],
  [/operation|\bops\b|logistics|supply/i, 'operations'],
  [/\bhr\b|people|recruit|talent/i, 'hr'],
  [/\bit\b|sysadmin|devops|infrastructure|security/i, 'it'],
  [/product manager|\bpm\b|product owner/i, 'product'],
];

export function departmentFor({ department, role } = {}) {
  const dep = String(department || '').toLowerCase().trim();
  if (DEPARTMENTS.includes(dep)) return dep;
  const r = String(role || '');
  for (const [re, d] of ROLE_HINTS) if (re.test(r)) return d;
  return 'general';
}

/**
 * The curated opportunity areas for a profile. Always includes the department's
 * areas plus the cross-functional 'general' set (deduped), so even a sparse
 * profile gets a useful starting map.
 */
export function opportunitiesForProfile(profile = {}) {
  const dep = departmentFor(profile);
  const areas = [...(CATALOG[dep] || []), ...CATALOG.general];
  const seen = new Set();
  return areas
    .filter((a) => (seen.has(a.key) ? false : (seen.add(a.key), true)))
    .map((a) => ({ ...a, department: dep === 'general' ? 'general' : (CATALOG[dep]?.some((x) => x.key === a.key) ? dep : 'general') }));
}

export default { CATALOG, DEPARTMENTS, DEPARTMENT_LABEL, departmentFor, opportunitiesForProfile };
