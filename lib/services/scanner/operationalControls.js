/**
 * Operational Controls Analysis (Phase 3).
 *
 * UNLIKE Phases 1–2 (which scan the workflow file), these checks read BLUEPRINT
 * metadata + version history — a workflow JSON has no concept of "owner",
 * "approval", or "change control". Confirmed against real data what's actually
 * populated (not just present in schema):
 *   • owner            = automation_blueprints.user_id (populated for real blueprints)
 *   • human_approval   = { required, approval_points } — `required` is set;
 *                        `approval_points` is empty in practice (0/15), so we
 *                        key the approval check on `required`, not approval_points
 *   • exception_rules  = manual-fallback signal (populated ~40%)
 *   • notification_rules = incident-notification signal (populated ~53%)
 *   • version history  = automation_blueprint_versions (5/15 have >1 version)
 *
 * NOT captured by the Blueprint today → owned by Phase 6 (schema additions), NOT
 * emitted as per-scan findings so they don't spam every blueprint:
 *   • `acceptance_criteria` (not a field at all)
 *   • dedicated accountable OWNER / approval-owner / exception-owner fields
 *     (only the creating user_id exists today)
 *   • policy-explicit approval directives ("approval required before refunds")
 *   • MONITORING REQUIREMENTS (ongoing: error-rate thresholds, SLA targets,
 *     execution-volume monitoring — "what to actively watch once live"). No
 *     such field exists. The only adjacent signals are misleading:
 *     `volume.estimated_executions` is populated on EVERY blueprint (it drives
 *     cost estimates), so a check keyed on it never fires; and
 *     `constraints.latency_requirement` is a performance constraint, not a
 *     monitoring plan. So this is a genuine Phase-6 schema addition, not a
 *     Phase-3 heuristic — flagging it now would be always-on noise.
 */
import { SEVERITY, finding } from './model.js';

/**
 * @param {{blueprint?, versionCount?, owner?}} ctx
 *  - blueprint:    the Blueprint content (human_approval, exception_rules, …)
 *  - versionCount: number of stored versions (change-control signal)
 *  - owner:        the assigned owner (user id/email), or null
 */
export function assessOperationalControls({ blueprint = {}, versionCount = 1, owner = null } = {}) {
  const out = [];

  // 3.1 Owner — simple "is an owner assigned" check (richer accountability = Phase 6).
  if (!owner) {
    out.push(finding({
      type: 'no_owner_assigned', severity: SEVERITY.MEDIUM,
      title: 'No owner assigned to the Blueprint',
      detail: 'This automation has no assigned owner, so accountability for its operation and governance is unclear.',
      node: null, manualReview: true,
      remediation: 'Assign an accountable owner. (A dedicated owner/approver field on the Blueprint is a Phase 6 addition.)',
    }));
  }

  // 3.1 Approval — key on human_approval.required (approval_points is empty in practice).
  const ha = blueprint.human_approval || {};
  if (ha.required == null) {
    out.push(finding({
      type: 'approval_unspecified', severity: SEVERITY.LOW,
      title: 'Human-approval requirement not specified',
      detail: 'The Blueprint hasn’t decided whether a human approval gate is required before the automation acts.',
      node: null, manualReview: true,
      remediation: 'Decide and record whether human approval is required (and at which points).',
    }));
  }

  // 3.2 Manual fallback / exception handling.
  if (!(blueprint.exception_rules || []).length) {
    out.push(finding({
      type: 'no_exception_handling', severity: SEVERITY.MEDIUM,
      title: 'No exception / manual-fallback rules defined',
      detail: 'No exception rules are defined, so there is no documented manual fallback when a step fails.',
      node: null, manualReview: true,
      remediation: 'Define exception rules / a manual fallback for the key failure scenarios.',
    }));
  }

  // 3.2 Incident notification.
  if (!(blueprint.notification_rules || []).length) {
    out.push(finding({
      type: 'no_incident_notification', severity: SEVERITY.MEDIUM,
      title: 'No incident/failure notification defined',
      detail: 'No notification rules are defined — failures may go unnoticed by an operator.',
      node: null, manualReview: true,
      remediation: 'Add a notification rule that alerts an owner/channel on failure.',
    }));
  }

  // 3.4 Recovery process — DISTINCT from manual fallback (3.2). Manual fallback =
  // what to do WHEN a step fails; recovery = how the automation is restored to a
  // working state AFTERWARD. No dedicated Blueprint field exists (that's Phase 6),
  // so we derive it from the real structural signals: a retry requirement that
  // defines an after-final-failure action, or an exception behavior that
  // describes recovery (restart/resume/reconcile/replay/rollback/restore).
  const RECOVERY_RE = /recover|restart|resume|reconcile|replay|re-?run|roll ?back|restore|re-?process/i;
  const retries = blueprint.retry_requirements || [];
  const excs = blueprint.exception_rules || [];
  const hasRecovery = retries.some((r) => r && r.after_final_failure) || excs.some((e) => RECOVERY_RE.test(String(e?.behavior || '')));
  if (!hasRecovery) {
    out.push(finding({
      type: 'no_recovery_process', severity: SEVERITY.MEDIUM,
      title: 'No documented recovery process',
      detail: 'Nothing defines how the automation is restored to a working state after a failure (an after-final-failure action or a recovery/restart step) — separate from the immediate manual fallback.',
      node: null, manualReview: true,
      remediation: 'Define what happens once retries are exhausted / a failure occurs — how the run is restarted, replayed, or reconciled back to a good state.',
    }));
  }

  // 3.3 Change control / version history — derived from Vyrade's versioning.
  if (!(versionCount > 1)) {
    out.push(finding({
      type: 'no_version_iteration', severity: SEVERITY.LOW,
      title: 'No version history (single version)',
      detail: 'Only one Blueprint version exists — there is no evidence of iteration, review, or change control.',
      node: null, manualReview: true,
      remediation: 'Iterate/review the Blueprint over versions; Vyrade records the version history automatically.',
    }));
  }

  return out;
}

export default { assessOperationalControls };
