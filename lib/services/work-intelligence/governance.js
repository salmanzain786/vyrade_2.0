/**
 * Governance & consent framework (Work Intelligence, Phase 1.4).
 *
 * The spec: "avoid positioning this as employee surveillance." So the defaults
 * are conservative — a bounded retention window, opportunities visible to
 * managers (not surfaced as individual performance), employees NOTIFIED, and
 * personal-performance inference OFF. An org can tighten to employee opt-in.
 */
export const RETENTION_DEFAULT_DAYS = 90;

export const DEFAULT_GOVERNANCE = {
  retention_days: RETENTION_DEFAULT_DAYS,   // how long ingested task content is kept
  opportunity_visibility: 'managers',       // 'managers' | 'admins' | 'employee_and_managers'
  employee_notification: 'notify',          // 'notify' | 'consent_required' | 'silent'
  consent_mode: 'org_authorized',           // 'org_authorized' | 'employee_opt_in'
  analyze_personal_performance: false,       // never infer who is "inefficient"
};

const VISIBILITY = new Set(['managers', 'admins', 'employee_and_managers']);
const NOTIFICATION = new Set(['notify', 'consent_required', 'silent']);
const CONSENT = new Set(['org_authorized', 'employee_opt_in']);
const clampDays = (v, d) => (Number.isFinite(+v) ? Math.min(3650, Math.max(1, Math.trunc(+v))) : d);

export function normalizeGovernance(raw = {}) {
  const g = raw && typeof raw === 'object' ? raw : {};
  return {
    retention_days: clampDays(g.retention_days, RETENTION_DEFAULT_DAYS),
    opportunity_visibility: VISIBILITY.has(g.opportunity_visibility) ? g.opportunity_visibility : 'managers',
    employee_notification: NOTIFICATION.has(g.employee_notification) ? g.employee_notification : 'notify',
    consent_mode: CONSENT.has(g.consent_mode) ? g.consent_mode : 'org_authorized',
    analyze_personal_performance: g.analyze_personal_performance === true, // opt-in only, defaults false
  };
}

/** Retention cutoff for a row ingested now (or at `from`). */
export function retentionExpiry(governance, from = new Date()) {
  const days = normalizeGovernance(governance).retention_days;
  return new Date(from.getTime() + days * 86400_000);
}

/** Does this governance config require an explicit employee opt-in before analysis? */
export function requiresEmployeeOptIn(governance) {
  const g = normalizeGovernance(governance);
  return g.consent_mode === 'employee_opt_in' || g.employee_notification === 'consent_required';
}

export default { DEFAULT_GOVERNANCE, RETENTION_DEFAULT_DAYS, normalizeGovernance, retentionExpiry, requiresEmployeeOptIn };
