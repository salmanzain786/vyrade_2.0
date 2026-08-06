/**
 * Remediation brief (Phase 7.1).
 *
 * Turns scan findings into concrete, generation-addressable directives that seed
 * Vyrade's EXISTING workflow generator (n8nSpecialist), so a regenerated workflow
 * specifically fixes what was flagged (correct retry limit, an added approval
 * step, org-owned creds, error handling, …) rather than being a blind rebuild.
 *
 * Honest split: only SOME finding types can be fixed by regeneration (structure/
 * config). Privacy/policy-of-record items (PII present, framework gaps, DSAR,
 * monitoring) are advisory — the brief lists them so the loop never pretends a
 * rebuild resolves something it can't.
 */

// finding type → a directive the generator can act on. A function receives the
// active policy so limits (retry ≤ N) and approval actions are concrete.
const DIRECTIVES = {
  missing_error_handling: () => 'Add explicit error handling: an error-trigger/error-workflow, or continue-on-fail with a dedicated failure branch on every external-call node.',
  policy_error_branch_missing: () => 'Add an error-handling branch — the approved policy requires one.',
  no_retry_configured: () => 'Enable retry-on-fail (with backoff) on every external/HTTP/AI node.',
  policy_retry_not_configured: (p) => `Enable retry-on-fail on external-call nodes${p?.error_handling?.max_retries != null ? ` (max ${p.error_handling.max_retries} attempts)` : ''}.`,
  policy_retry_limit_exceeded: (p) => `Reduce every node's retry count to at most ${p?.error_handling?.max_retries ?? 3} attempts (policy limit).`,
  policy_approval_missing: (p) => `Add a human-approval / wait step before the governed action${p?.approvals?.approval_actions?.length ? ` (${p.approvals.approval_actions.join(', ')})` : ''}, so a person confirms before it proceeds.`,
  approval_unspecified: () => 'Add an explicit human-approval/wait step before any irreversible or outbound action.',
  public_webhook_no_auth: () => 'Enable authentication (header or JWT) on every webhook trigger — no unauthenticated public webhooks.',
  weak_webhook_auth: () => 'Upgrade webhook authentication to header/JWT/HMAC-signature with a strong secret.',
  insecure_http: () => 'Use https:// for every external endpoint (no plain http://).',
  embedded_url_password: () => 'Never inline passwords in connection URLs — reference a stored credential instead.',
  hardcoded_credential: () => 'Remove any hardcoded secrets; reference stored credentials only.',
  hardcoded_webhook_secret: () => 'Store webhook URLs/secrets in the credential store, not in node parameters.',
  policy_external_model_used: () => 'Replace hosted third-party AI models with an approved/self-hosted model.',
  policy_self_hosted_violation: () => 'Replace hosted SaaS dependencies with self-hosted equivalents (policy requires self-hosted only).',
  policy_forbidden_platform: () => 'Remove the forbidden platform integration and use an approved alternative.',
  policy_personal_credential: () => 'Use organisation-owned service-account credentials, never personal accounts.',
  personal_credential_dependency: () => 'Use organisation-owned service-account credentials, never personal accounts.',
  excessive_permissions: () => 'Request the minimum OAuth scopes each integration actually needs (least privilege).',
  unsafe_ai_tool_permissions: () => 'Scope any AI agent to the minimum tools required; review code/HTTP tools it can call.',
  prompt_injection_exposure: () => 'Sanitize/constrain external input before it reaches an AI prompt; prefer structured fields over free-text passthrough.',
};

// Types that regeneration can't resolve — surfaced as advisory, not promised.
const ADVISORY_NOTE = {
  pii_detected: 'PII handling is a data/process decision — confirm it is necessary and minimised.',
  special_category_data: 'Special-category data needs an explicit lawful basis — not fixable by regeneration.',
  data_minimisation: 'Review whether every collected field is actually needed.',
  third_party_processor: 'Ensure a data-processing agreement exists with each processor.',
  consent_dependent_action: 'Add a consent gate/record upstream — a process control, not a node config.',
  sensitive_logging: 'Avoid logging sensitive fields; verify at the log sink.',
  no_retention_control: 'Define a data-retention/deletion policy — organisational, not in the workflow.',
  policy_log_retention_undeclared: 'Confirm log retention at the sink; not visible in the workflow.',
  policy_data_egress: 'Verify no customer data is in outbound payloads — manual confirmation.',
  no_owner_assigned: 'Assign an accountable owner on the Blueprint.',
  no_incident_notification: 'Decide the incident-notification channel (Blueprint/policy).',
};

/**
 * @param {{findings:Array, policy?:object}} args
 * @returns {{directives:string[], addressable_types:string[], advisory:Array<{type,note}>, count:number}}
 */
export function buildRemediationBrief({ findings = [], policy = null } = {}) {
  const seen = new Set();
  const directives = [];
  const addressable = new Set();
  const advisory = [];

  for (const f of findings) {
    const make = DIRECTIVES[f.type];
    if (make) {
      const text = make(policy, f);
      if (!seen.has(text)) { seen.add(text); directives.push(text); }
      addressable.add(f.type);
    } else if (ADVISORY_NOTE[f.type] && !advisory.some((a) => a.type === f.type)) {
      advisory.push({ type: f.type, note: ADVISORY_NOTE[f.type] });
    }
    // Version drift needs no directive — regenerating from the current Blueprint
    // version resolves it inherently.
  }

  return { directives, addressable_types: [...addressable], advisory, count: directives.length };
}

/** Render the brief as a prompt block for the generator (null if nothing to do). */
export function remediationPromptBlock(brief) {
  if (!brief || !brief.directives.length) return null;
  return [
    'REMEDIATION REQUIREMENTS (a governance scan flagged the previous version of this workflow — the regenerated workflow MUST address each of these, without changing the Blueprint\'s intent):',
    ...brief.directives.map((d, i) => `${i + 1}. ${d}`),
  ].join('\n');
}

export default { buildRemediationBrief, remediationPromptBlock };
