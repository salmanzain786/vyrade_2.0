/**
 * Connection scope configuration (Work Intelligence, Phase 1.3).
 *
 * The spec is emphatic: "Vyrade should not automatically read the entire
 * workspace without clear authorisation." So the default scope reads NOTHING
 * (no projects selected, write-back OFF, comments/attachments OFF) — an admin
 * must explicitly opt each surface in. Every field here maps to a control on the
 * connection-setup screen.
 */
export const DEFAULT_SCOPE = {
  workspaces: [],            // selected workspace/team ids
  projects: [],              // included project/list ids — EMPTY until chosen (read nothing by default)
  excluded_projects: [],     // explicit denylist even within selected workspaces
  fields: {                  // which task fields are analysed
    description: true,
    checklist: true,
    status_history: true,
    comments: false,         // off by default — may contain sensitive discussion
    attachments: false,      // off by default — never processed unless opted in
    custom_fields: false,
  },
  read_enabled: true,
  write_back_enabled: false, // SEPARATE, off by default (Phase 4.1 governance)
  departments: [],           // limit analysis to these departments
  employees: [],             // limit analysis to these employees (empty = all in scope)
  historical_range_days: 90, // how far back to ingest
  sensitive_rules: {
    redact_secrets: true,          // always reuse the scanner's secret redaction
    redact_emails: true,           // strip emails/PII from stored text
    exclude_personal_projects: true,
    analyze_personal_performance: false, // never infer individual performance (anti-surveillance)
  },
};

const bool = (v, d) => (typeof v === 'boolean' ? v : d);
const idList = (v) => (Array.isArray(v) ? [...new Set(v.map((x) => String(x).trim()).filter(Boolean))].slice(0, 500) : []);
const clampDays = (v, d) => (Number.isFinite(+v) ? Math.min(3650, Math.max(0, Math.trunc(+v))) : d);

export function normalizeScope(raw = {}) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const d = DEFAULT_SCOPE;
  return {
    workspaces: idList(s.workspaces),
    projects: idList(s.projects),
    excluded_projects: idList(s.excluded_projects),
    fields: {
      description: bool(s.fields?.description, d.fields.description),
      checklist: bool(s.fields?.checklist, d.fields.checklist),
      status_history: bool(s.fields?.status_history, d.fields.status_history),
      comments: bool(s.fields?.comments, d.fields.comments),
      attachments: bool(s.fields?.attachments, d.fields.attachments),
      custom_fields: bool(s.fields?.custom_fields, d.fields.custom_fields),
    },
    read_enabled: bool(s.read_enabled, d.read_enabled),
    write_back_enabled: bool(s.write_back_enabled, d.write_back_enabled),
    departments: idList(s.departments),
    employees: idList(s.employees),
    historical_range_days: clampDays(s.historical_range_days, d.historical_range_days),
    sensitive_rules: {
      redact_secrets: bool(s.sensitive_rules?.redact_secrets, d.sensitive_rules.redact_secrets),
      redact_emails: bool(s.sensitive_rules?.redact_emails, d.sensitive_rules.redact_emails),
      exclude_personal_projects: bool(s.sensitive_rules?.exclude_personal_projects, d.sensitive_rules.exclude_personal_projects),
      analyze_personal_performance: bool(s.sensitive_rules?.analyze_personal_performance, d.sensitive_rules.analyze_personal_performance),
    },
  };
}

/** Is a given project/list id in scope? (selected, not excluded) */
export function isProjectInScope(scope, projectId) {
  const id = String(projectId);
  if (scope.excluded_projects.includes(id)) return false;
  return scope.projects.length === 0 ? false : scope.projects.includes(id);
}

export default { DEFAULT_SCOPE, normalizeScope, isProjectInScope };
