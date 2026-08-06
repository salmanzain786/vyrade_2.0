/**
 * Assessment Report Generation (Phase 5) — the customer-facing report over the
 * Phase 1–4 outputs. Directional, never overstated: a gap assessment, not a
 * certification. The Evidence & Limitations section is first-class (5.4) — it's
 * what keeps the whole feature honest.
 */
import { FRAMEWORK_DISCLAIMER, FRAMEWORK_REVIEW } from './frameworks.js';

// Finding-type → phase/category, so the report can separate "detected from the
// workflow" (Phases 1–2) from "inherited from the Blueprint" (Phase 3).
const SECURITY_TYPES = new Set(['hardcoded_credential', 'embedded_url_password', 'hardcoded_webhook_secret', 'insecure_http', 'public_webhook_no_auth', 'weak_webhook_auth', 'excessive_permissions', 'prompt_injection_exposure', 'unsafe_ai_tool_permissions', 'missing_error_handling', 'no_retry_configured', 'browser_automation_risk', 'personal_credential_dependency']);
const PRIVACY_TYPES = new Set(['pii_detected', 'special_category_data', 'data_minimisation', 'third_party_processor', 'consent_dependent_action', 'sensitive_logging', 'no_retention_control']);
const GOVERNANCE_TYPES = new Set(['no_owner_assigned', 'approval_unspecified', 'no_exception_handling', 'no_incident_notification', 'no_recovery_process', 'no_version_iteration']);

const categoryOf = (t) => (SECURITY_TYPES.has(t) ? 'security' : PRIVACY_TYPES.has(t) ? 'privacy' : GOVERNANCE_TYPES.has(t) ? 'governance' : 'other');
const sourceOf = (t) => (GOVERNANCE_TYPES.has(t) ? 'blueprint' : 'workflow');

const RANK = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
const WEIGHT = { critical: 20, high: 12, medium: 6, low: 2, info: 0 };

const WORKFLOW_CHECK_FAMILIES = ['Credentials & secrets', 'Access & authentication', 'AI prompt-injection & tool permissions', 'Error handling, retry & recovery', 'Browser automation', 'PII & special-category data', 'Data minimisation', 'Third-party processors', 'Consent gates', 'Sensitive logging', 'Data retention'];
const BLUEPRINT_CHECK_FAMILIES = ['Owner assignment', 'Approval requirement', 'Exception / manual fallback', 'Incident notification', 'Recovery process', 'Version history / change control'];
const OUT_OF_SCOPE = ['Runtime/hosting configuration and secrets management', 'Infrastructure & network security', 'The actual VALUES of credentials (only their presence is checked)', 'Organisational policies not encoded in the Blueprint', 'Deployment, access management, and platform-side controls'];

export function generateAssessmentReport({ findings = [], framework_mapping = null, platform = 'n8n', workflow_name = null, node_count = 0, blueprintAssessed = false } = {}) {
  // ── 5.1 Overall assessment summary (directional) ──
  // Deduct per DISTINCT finding TYPE (worst severity), so the same issue class
  // repeated across many nodes doesn't crater the score — readiness reflects
  // distinct problem areas, not per-node repetition.
  const worstByType = new Map();
  for (const f of findings) {
    if (!worstByType.has(f.type) || RANK[f.severity] > RANK[worstByType.get(f.type)]) worstByType.set(f.type, f.severity);
  }
  const deduction = Math.min(90, [...worstByType.values()].reduce((s, sev) => s + (WEIGHT[sev] || 0), 0));
  const governance_readiness_pct = Math.max(0, Math.round((100 - deduction) / 5) * 5);
  const readiness_band = governance_readiness_pct >= 85 ? 'Strong' : governance_readiness_pct >= 70 ? 'Moderate' : governance_readiness_pct >= 50 ? 'Needs work' : 'Weak';

  const riskBearing = findings.filter((f) => categoryOf(f.type) === 'security' || categoryOf(f.type) === 'privacy');
  const worstRisk = riskBearing.reduce((w, f) => (RANK[f.severity] > RANK[w] ? f.severity : w), 'info');
  const security_risk_level = riskBearing.length === 0 ? 'Low' : (worstRisk === 'critical' || worstRisk === 'high') ? 'High' : worstRisk === 'medium' ? 'Medium' : 'Low';

  const framework_alignment = (framework_mapping?.frameworks || []).map((fw) => ({
    framework: fw.framework,
    status: fw.gap_areas > 0 ? 'Gaps identified' : 'No gaps detected',
    gap_areas: fw.gap_areas,
    assessed_areas: fw.assessed_areas,
    not_assessed: fw.not_assessed,
  }));

  // ── 5.2 Critical / high-priority findings ──
  const fmt = (f) => ({ type: f.type, severity: f.severity, title: f.title, detail: f.detail, node: f.node, category: categoryOf(f.type), manual_review: f.manual_review });
  const priority_findings = {
    critical: findings.filter((f) => f.severity === 'critical').map(fmt),
    high: findings.filter((f) => f.severity === 'high').map(fmt),
  };

  // ── 5.3 Remediation recommendations (aggregated by type) ──
  const byType = new Map();
  for (const f of findings) {
    if (!byType.has(f.type)) byType.set(f.type, { type: f.type, category: categoryOf(f.type), severity: f.severity, recommendation: f.remediation || null, nodes: new Set(), count: 0 });
    const r = byType.get(f.type);
    r.count += 1;
    if (RANK[f.severity] > RANK[r.severity]) r.severity = f.severity;
    if (f.node) r.nodes.add(f.node);
  }
  const remediations = [...byType.values()]
    .sort((a, b) => RANK[b.severity] - RANK[a.severity])
    .map((r) => ({
      type: r.type, category: r.category, severity: r.severity, count: r.count,
      recommendation: r.recommendation,
      nodes: [...r.nodes],
      // Phase 6 hook: governance/policy items are best fixed by declaring policy
      // on the Blueprint and regenerating, once Phase 6 exists.
      blueprint_hint: r.category === 'governance' ? 'Declare the requirement on the Blueprint and regenerate (Phase 6 Blueprint-aware remediation).' : null,
    }));

  // ── 5.4 Evidence & limitations (first-class, honest) ──
  const detectedFromWorkflow = findings.filter((f) => sourceOf(f.type) === 'workflow').length;
  const fromBlueprint = findings.filter((f) => sourceOf(f.type) === 'blueprint').length;
  const notAssessedAreas = (framework_mapping?.frameworks || []).flatMap((fw) => fw.areas.filter((a) => a.status === 'Not assessed').map((a) => `${fw.framework}: ${a.area}`));

  const evidence_and_limitations = {
    detected_from_workflow: {
      note: `Parsed the uploaded ${platform} workflow (${node_count} nodes) and ran these check families.`,
      check_families: WORKFLOW_CHECK_FAMILIES,
      finding_count: detectedFromWorkflow,
    },
    from_blueprint: blueprintAssessed
      ? { assessed: true, note: 'Operational controls read from the Blueprint metadata + version history.', check_families: BLUEPRINT_CHECK_FAMILIES, finding_count: fromBlueprint }
      : { assessed: false, note: 'No Blueprint context provided — operational controls (owner/approval/exception/notification/recovery/change-control) were NOT assessed. Scan by blueprintId to include them.' },
    not_assessed: [
      ...notAssessedAreas,
      'Data-subject rights (DSAR), acceptance criteria, monitoring requirements, and policy-explicit limits (retry N, consent-before-X, retain-N-days) — require Blueprint policy fields (Phase 6).',
      'Manual-review items below need human confirmation (see manual_review_items).',
    ],
    out_of_scope: OUT_OF_SCOPE,
    manual_review_items: findings.filter((f) => f.manual_review).length,
    framework_mappings_reviewed: FRAMEWORK_REVIEW.status === 'reviewed',
  };

  return {
    overall: {
      governance_readiness_pct,
      readiness_band,
      security_risk_level,
      framework_alignment,
      caveat: 'Directional only — a gap assessment, not a precise score or certification.',
    },
    priority_findings,
    remediations,
    evidence_and_limitations,
    disclaimer: FRAMEWORK_DISCLAIMER,
    framework_review: FRAMEWORK_REVIEW,
  };
}

export default { generateAssessmentReport };
