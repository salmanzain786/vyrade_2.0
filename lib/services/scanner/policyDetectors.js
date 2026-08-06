/**
 * Blueprint-vs-workflow diff engine (Phase 6.2) + version-drift (6.3).
 *
 * This is the differentiator: Phases 1–3 flag GENERIC risk ("this webhook has no
 * auth"); Phase 6 asks "does the workflow match what was APPROVED?" — comparing
 * the scanned workflow model against the human-authored governance policy
 * (policy.js). The same underlying signal (a personal credential, a missing
 * error branch) becomes a POLICY VIOLATION when a policy forbids it, which is a
 * categorically stronger, more actionable finding.
 *
 * Every finding here is gated on an explicit, enabled policy directive, so an
 * un-authored policy produces nothing (no noise).
 */
import { SEVERITY, finding } from './model.js';
import { normalizePolicy } from './policy.js';

// External (hosted, third-party) LLM providers vs. self-hosted/local models.
const EXTERNAL_AI_RE = /openai|anthropic|cohere|huggingface|mistral|\bpalm\b|gemini|vertex|perplexity|groq|together/i;
const SELF_HOSTED_AI_RE = /ollama|localai|self.?host|\blocal\b|llama\.?cpp|vllm/i;
const PERSONAL_CRED_RE = /personal|\bmy\b|@gmail\.|@yahoo\.|@outlook\.|@hotmail\./i;
// Nodes that look like an explicit human-approval / manual gate.
const APPROVAL_NODE_RE = /approv|wait|manualTrigger|humanInput|human.?in.?the.?loop|sendAndWait|confirm/i;

const isExternalAiNode = (n) => n.isAI && EXTERNAL_AI_RE.test(n.type || '') && !SELF_HOSTED_AI_RE.test(`${n.type} ${JSON.stringify(n.parameters || {})}`);

/**
 * @param {{policy, model, blueprint}} args  model may be null (controls-only scan).
 * @returns {Array} policy-violation findings (category 'policy').
 */
export function comparePolicyToWorkflow({ policy, model = null, blueprint = {} } = {}) {
  const p = normalizePolicy(policy);
  if (!p.enabled) return [];
  const out = [];
  const nodes = model?.nodes || [];

  // ── Data handling: external AI models ──
  if (!p.data_handling.allow_external_ai_models) {
    for (const n of nodes.filter(isExternalAiNode)) {
      out.push(finding({
        type: 'policy_external_model_used', severity: SEVERITY.HIGH,
        title: 'Policy violation: external AI model used',
        detail: `Policy forbids external AI models, but node "${n.name}" calls a hosted third-party model (${n.app || n.shortType}).`,
        node: n.name,
        remediation: 'Switch to a self-hosted/approved model, or update the policy if external models are in fact permitted.',
      }));
    }
  }

  // ── Data handling: customer data to third parties ──
  // Conservative: only flags when an external AI/HTTP egress coincides with a
  // policy that forbids third-party data sharing (manual review — we can't prove
  // customer data actually flows there from the JSON alone).
  if (!p.data_handling.allow_customer_data_to_third_party) {
    const egress = nodes.find((n) => isExternalAiNode(n) || (n.isHttp && !n.isTrigger));
    if (egress) {
      out.push(finding({
        type: 'policy_data_egress', severity: SEVERITY.HIGH,
        title: 'Policy: possible customer-data egress to a third party',
        detail: `Policy forbids sending customer data to third parties. Node "${egress.name}" makes an external call — confirm no customer data is included in the payload.`,
        node: egress.name, manualReview: true,
        remediation: 'Verify the outbound payload carries no customer data, or route through an approved processor.',
      }));
    }
  }

  // ── Platform policy: forbidden / required / hosting ──
  if (p.platform_policy.forbidden_platforms.length) {
    const forbidden = new Set(p.platform_policy.forbidden_platforms);
    for (const n of nodes) {
      const app = String(n.app || '').toLowerCase();
      if (app && forbidden.has(app)) {
        out.push(finding({
          type: 'policy_forbidden_platform', severity: SEVERITY.HIGH,
          title: `Policy violation: forbidden platform "${app}"`,
          detail: `Policy forbids "${app}", but node "${n.name}" uses it.`,
          node: n.name,
          remediation: `Remove the "${app}" integration or update the policy.`,
        }));
      }
    }
  }
  if (p.platform_policy.required_platforms.length) {
    const present = new Set(nodes.map((n) => String(n.app || '').toLowerCase()).filter(Boolean));
    for (const req of p.platform_policy.required_platforms) {
      if (!present.has(req)) {
        out.push(finding({
          type: 'policy_missing_required_platform', severity: SEVERITY.MEDIUM,
          title: `Policy: required platform "${req}" not found`,
          detail: `Policy requires "${req}", but no node in the workflow uses it.`,
          node: null, manualReview: true,
          remediation: `Add the required "${req}" integration, or update the policy.`,
        }));
      }
    }
  }
  if (p.platform_policy.hosting === 'self_hosted') {
    const saas = nodes.filter((n) => isExternalAiNode(n));
    for (const n of saas) {
      out.push(finding({
        type: 'policy_self_hosted_violation', severity: SEVERITY.HIGH,
        title: 'Policy violation: self-hosted-only, but a hosted service is used',
        detail: `Policy requires self-hosted only, but node "${n.name}" depends on a hosted third-party service (${n.app || n.shortType}).`,
        node: n.name,
        remediation: 'Replace with a self-hosted equivalent, or relax the hosting policy.',
      }));
    }
  }

  // ── Credential ownership ──
  if (p.credential_policy.require_org_owned) {
    for (const n of nodes) {
      for (const cred of Object.values(n.credentials || {})) {
        if (PERSONAL_CRED_RE.test(String(cred?.name || ''))) {
          out.push(finding({
            type: 'policy_personal_credential', severity: SEVERITY.MEDIUM,
            title: 'Policy violation: personal credential where org-owned is required',
            detail: `Policy requires org-owned credentials, but node "${n.name}" uses "${cred.name}", which looks personal.`,
            node: n.name, manualReview: true,
            remediation: 'Replace with an organisation-owned service account.',
          }));
        }
      }
    }
  }

  // ── Error handling: required error branch ──
  if (p.error_handling.require_error_branch && model && !model.hasErrorHandling) {
    out.push(finding({
      type: 'policy_error_branch_missing', severity: SEVERITY.HIGH,
      title: 'Policy violation: required error handling is missing',
      detail: 'Policy requires an error branch / error workflow, but the workflow has none.',
      node: null,
      remediation: 'Add an error trigger / error workflow, or a continue-on-fail failure branch on risky nodes.',
    }));
  }

  // ── Error handling: retry limit ──
  if (p.error_handling.max_retries != null) {
    const limit = p.error_handling.max_retries;
    const risky = nodes.filter((n) => n.isHttp || n.isAI || n.app);
    const unconfigured = risky.filter((n) => n.retryOnFail !== true);
    const over = risky.filter((n) => Number.isFinite(n.maxTries) && n.maxTries > limit);
    if (over.length) {
      out.push(finding({
        type: 'policy_retry_limit_exceeded', severity: SEVERITY.MEDIUM,
        title: `Policy violation: retry count exceeds the limit of ${limit}`,
        detail: `${over.length} node(s) are configured to retry more than the policy limit of ${limit}.`,
        node: over.length === 1 ? over[0].name : null,
        remediation: `Lower retry counts to ≤ ${limit}, or raise the policy limit.`,
      }));
    }
    if (unconfigured.length) {
      out.push(finding({
        type: 'policy_retry_not_configured', severity: SEVERITY.LOW,
        title: 'Policy: retry limit set, but external calls have no retry configured',
        detail: `Policy defines a retry limit of ${limit}, but ${unconfigured.length} external-call node(s) have no retry configured.`,
        node: unconfigured.length === 1 ? unconfigured[0].name : null, manualReview: true,
        remediation: `Configure retry-on-fail (≤ ${limit}) on external-call nodes.`,
      }));
    }
  }

  // ── Approvals ──
  if (p.approvals.require_human_approval) {
    const workflowHasGate = nodes.some((n) => APPROVAL_NODE_RE.test(`${n.type} ${n.name}`));
    const blueprintDeclares = blueprint?.human_approval?.required === true;
    if (!workflowHasGate && !blueprintDeclares) {
      const actions = p.approvals.approval_actions.length ? ` (${p.approvals.approval_actions.join(', ')})` : '';
      out.push(finding({
        type: 'policy_approval_missing', severity: SEVERITY.HIGH,
        title: 'Policy violation: required human approval is missing',
        detail: `Policy requires human approval${actions}, but neither the workflow nor the Blueprint defines an approval gate.`,
        node: null, manualReview: true,
        remediation: 'Add an approval/wait step before the governed action, and record the approval requirement on the Blueprint.',
      }));
    }
  }

  // ── Alerting ──
  if (p.alerting.require_incident_alert && !((blueprint?.notification_rules || []).length)) {
    out.push(finding({
      type: 'policy_alerting_missing', severity: SEVERITY.MEDIUM,
      title: 'Policy violation: required incident alerting is missing',
      detail: 'Policy requires failure/incident alerting, but the Blueprint defines no notification rule.',
      node: null, manualReview: true,
      remediation: 'Add a notification rule that alerts an owner/channel on failure.',
    }));
  }

  // ── Logging retention (policy-declared; not visible in a workflow) ──
  if (p.logging.max_log_retention_days != null) {
    out.push(finding({
      type: 'policy_log_retention_undeclared', severity: SEVERITY.LOW,
      title: `Policy: log-retention limit of ${p.logging.max_log_retention_days} days requires confirmation`,
      detail: `Policy sets a maximum log-retention of ${p.logging.max_log_retention_days} days. Retention is a runtime/platform setting not visible in the workflow — confirm it is enforced where logs are stored.`,
      node: null, manualReview: true,
      remediation: 'Confirm and document the log-retention configuration at the log sink; this cannot be verified from the workflow alone.',
    }));
  }

  return out;
}

/**
 * Version-drift (6.3): the scanned workflow was generated from a specific
 * Blueprint version. If the Blueprint has advanced since, the workflow may no
 * longer reflect what's approved. Reuses Vyrade's existing versioning.
 * @param {{workflowVersion:?number, currentVersion:?number}} args
 */
export function detectVersionDrift({ workflowVersion = null, currentVersion = null } = {}) {
  if (!Number.isFinite(workflowVersion) || !Number.isFinite(currentVersion)) return [];
  if (workflowVersion >= currentVersion) return [];
  const behind = currentVersion - workflowVersion;
  return [finding({
    type: 'workflow_version_drift', severity: SEVERITY.MEDIUM,
    title: 'Workflow generated from an outdated Blueprint version',
    detail: `This workflow was generated from Blueprint v${workflowVersion}, but the current approved version is v${currentVersion} (${behind} version${behind === 1 ? '' : 's'} behind) — it may not reflect the latest approved design.`,
    node: null, manualReview: true,
    remediation: `Regenerate the workflow from the current Blueprint (v${currentVersion}) and re-scan.`,
  })];
}

// Every finding type this module can emit (for the report's category mapping).
export const POLICY_FINDING_TYPES = [
  'policy_external_model_used', 'policy_data_egress', 'policy_forbidden_platform',
  'policy_missing_required_platform', 'policy_self_hosted_violation', 'policy_personal_credential',
  'policy_error_branch_missing', 'policy_retry_limit_exceeded', 'policy_retry_not_configured',
  'policy_approval_missing', 'policy_alerting_missing', 'policy_log_retention_undeclared',
  'workflow_version_drift',
];

export default { comparePolicyToWorkflow, detectVersionDrift, POLICY_FINDING_TYPES };
