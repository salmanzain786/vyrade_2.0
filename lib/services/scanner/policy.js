/**
 * Governance & Policy Requirements schema (Phase 6.1).
 *
 * The Blueprint describes WHAT is being built and how it scored; it does not
 * capture granular policy directives ("no external AI model", "retry limit of
 * 3", "org-owned credentials only"). Verified against real data: the schema's
 * policy-adjacent slots (prohibited_platforms, required_platforms,
 * self_hosting_required, security/compliance_requirements, approval_points) are
 * 0% populated by the generation flow — so this is a genuine, human-authored
 * addition, stored SEPARATELY from the versioned Blueprint JSON (a regeneration
 * must never clobber the approved policy). One populated signal DOES exist —
 * retry_requirements[].max_retries (~40%) — so we seed a default from it.
 *
 * Policy comparison is OPT-IN: an un-authored / disabled policy produces NO
 * findings, so Phase 6 never spams a blueprint that hasn't declared a policy.
 */

// The canonical, normalised policy shape. Permissive defaults → zero violations
// until a human tightens something. `enabled:false` means "don't compare yet".
export const DEFAULT_POLICY = {
  enabled: false,
  data_handling: {
    allow_external_ai_models: true,          // false → external LLM providers are violations
    allow_customer_data_to_third_party: true, // false → external egress with an AI/HTTP call is flagged
  },
  platform_policy: {
    hosting: 'any',                          // 'any' | 'self_hosted'
    forbidden_platforms: [],                 // app slugs (lowercase) that must NOT appear
    required_platforms: [],                  // app slugs that MUST appear
  },
  credential_policy: {
    require_org_owned: false,                // true → personal-looking credentials are violations
  },
  error_handling: {
    require_error_branch: false,             // true → workflow must have error handling
    max_retries: null,                       // number → per-node retry config must exist and not exceed
  },
  approvals: {
    require_human_approval: false,           // true → an approval gate must exist (workflow node or Blueprint)
    approval_actions: [],                    // free-text: e.g. "before refunds", "before external comms"
  },
  alerting: {
    require_incident_alert: false,           // true → Blueprint must define a failure notification
  },
  logging: {
    forbid_sensitive_logging: false,         // true → escalates any sensitive-logging finding
    max_log_retention_days: null,            // number → a retention limit must be declared (manual review)
  },
};

const isFiniteNum = (v) => typeof v === 'number' && Number.isFinite(v);
const asBool = (v, d) => (typeof v === 'boolean' ? v : d);
const asNumOrNull = (v) => (isFiniteNum(v) ? v : (typeof v === 'string' && v.trim() !== '' && Number.isFinite(+v) ? +v : null));
const asSlugList = (v) => (Array.isArray(v) ? [...new Set(v.map((x) => String(x).trim().toLowerCase()).filter(Boolean))] : []);
const asStrList = (v) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : []);

/** Coerce arbitrary stored/submitted JSON into the canonical shape (never throws). */
export function normalizePolicy(raw = {}) {
  const p = raw && typeof raw === 'object' ? raw : {};
  const d = DEFAULT_POLICY;
  return {
    enabled: asBool(p.enabled, d.enabled),
    data_handling: {
      allow_external_ai_models: asBool(p.data_handling?.allow_external_ai_models, d.data_handling.allow_external_ai_models),
      allow_customer_data_to_third_party: asBool(p.data_handling?.allow_customer_data_to_third_party, d.data_handling.allow_customer_data_to_third_party),
    },
    platform_policy: {
      hosting: p.platform_policy?.hosting === 'self_hosted' ? 'self_hosted' : 'any',
      forbidden_platforms: asSlugList(p.platform_policy?.forbidden_platforms),
      required_platforms: asSlugList(p.platform_policy?.required_platforms),
    },
    credential_policy: {
      require_org_owned: asBool(p.credential_policy?.require_org_owned, d.credential_policy.require_org_owned),
    },
    error_handling: {
      require_error_branch: asBool(p.error_handling?.require_error_branch, d.error_handling.require_error_branch),
      max_retries: asNumOrNull(p.error_handling?.max_retries),
    },
    approvals: {
      require_human_approval: asBool(p.approvals?.require_human_approval, d.approvals.require_human_approval),
      approval_actions: asStrList(p.approvals?.approval_actions),
    },
    alerting: {
      require_incident_alert: asBool(p.alerting?.require_incident_alert, d.alerting.require_incident_alert),
    },
    logging: {
      forbid_sensitive_logging: asBool(p.logging?.forbid_sensitive_logging, d.logging.forbid_sensitive_logging),
      max_log_retention_days: asNumOrNull(p.logging?.max_log_retention_days),
    },
  };
}

/**
 * Seed a starting policy from what the Blueprint DID capture, so authoring
 * begins from reality rather than a blank form. Stays disabled until a human
 * reviews and turns it on. The only reliably-populated signal is
 * retry_requirements[].max_retries; human_approval/notification_rules are used
 * as soft suggestions.
 */
export function deriveDefaultPolicy(blueprint = {}) {
  const base = normalizePolicy({});
  const retries = (blueprint?.retry_requirements || []).map((r) => r?.max_retries).filter(isFiniteNum);
  if (retries.length) base.error_handling.max_retries = Math.max(...retries);
  if (blueprint?.human_approval?.required === true) {
    base.approvals.require_human_approval = true;
    base.approvals.approval_actions = asStrList((blueprint.human_approval.approval_points || []).map((a) => a?.action || a?.scenario || a));
  }
  return base;
}

/** Is anything in this policy actually constraining? (used to decide if it's worth evaluating) */
export function policyHasConstraints(p) {
  const n = normalizePolicy(p);
  return (
    !n.data_handling.allow_external_ai_models ||
    !n.data_handling.allow_customer_data_to_third_party ||
    n.platform_policy.hosting === 'self_hosted' ||
    n.platform_policy.forbidden_platforms.length > 0 ||
    n.platform_policy.required_platforms.length > 0 ||
    n.credential_policy.require_org_owned ||
    n.error_handling.require_error_branch ||
    n.error_handling.max_retries != null ||
    n.approvals.require_human_approval ||
    n.alerting.require_incident_alert ||
    n.logging.forbid_sensitive_logging ||
    n.logging.max_log_retention_days != null
  );
}

export default { DEFAULT_POLICY, normalizePolicy, deriveDefaultPolicy, policyHasConstraints };
