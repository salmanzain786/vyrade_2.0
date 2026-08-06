/**
 * Framework Mapping Engine (Phase 4).
 *
 * Pure lookup: maps the stable finding `type` slugs produced by Phases 1–3 to
 * GDPR / HIPAA / SOC 2 areas. NO new detection logic — it reuses everything
 * already found. Output drives the spec's "Framework / Assessed areas /
 * Potential gaps / Status" table.
 *
 * IMPORTANT: this is a GAP ASSESSMENT, NOT A CERTIFICATION. Absence of a finding
 * does not confirm compliance — the disclaimer travels with the result so the
 * report (Phase 5) and UI can't forget to say it.
 */
export const FRAMEWORK_DISCLAIMER =
  'This is an automated gap assessment, not a compliance certification. Findings highlight areas to review; the absence of a finding does not confirm compliance, and configuration/infrastructure/organisational controls outside the workflow are not evaluated.';

/**
 * Legal/compliance review state of the GDPR/HIPAA/SOC 2 mappings below. The
 * mappings are an engineering-reasonable first pass; whether each area↔finding
 * mapping and each statutory citation is legally accurate is a domain-expert
 * judgment. Until a qualified reviewer signs off, `status` stays 'unreviewed'
 * and `mapFrameworks` returns a stronger warning so the report/UI cannot present
 * this to customers as authoritative. When reviewed, set status/reviewer/date.
 */
export const FRAMEWORK_REVIEW = {
  status: 'unreviewed',   // 'unreviewed' | 'reviewed'
  reviewer: null,         // name/role of the compliance/legal reviewer
  reviewed_at: null,      // ISO date of sign-off
  warning: 'These framework mappings have NOT yet been reviewed by a compliance/legal professional. Do not present them to customers as authoritative until reviewed (see COMPLIANCE_MAPPING_REVIEW.md).',
};

/** Raw area↔trigger definitions, for the review artifact + audit. */
export function describeFrameworkAreas() {
  return FRAMEWORKS.map((fw) => ({
    framework: fw.name,
    areas: fw.areas.map((a) => ({ area: a.area, triggers: a.triggers, not_assessed: !!a.notAssessed, note: a.note || null })),
  }));
}

const RANK = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };

// Each area lists the finding types that indicate a POTENTIAL gap there. An area
// with `notAssessed` can't be judged from the scan alone (needs Blueprint policy
// / manual or legal review) — stated honestly rather than shown as a pass.
const GDPR = {
  name: 'GDPR', areas: [
    { area: 'Personal-data processing (Art. 5/6)', triggers: ['pii_detected', 'special_category_data'] },
    { area: 'Lawful basis & consent (Art. 6/7/9)', triggers: ['consent_dependent_action', 'special_category_data'] },
    { area: 'Data minimisation (Art. 5(1)(c))', triggers: ['data_minimisation'] },
    { area: 'Storage limitation / retention (Art. 5(1)(e))', triggers: ['no_retention_control', 'sensitive_logging'] },
    { area: 'Data-subject rights / DSAR (Art. 15–17)', triggers: [], notAssessed: true, note: 'DSAR handling is an organisational capability declared on the Blueprint — assessed in Phase 6.' },
    { area: 'Third-party processors (Art. 28)', triggers: ['third_party_processor'] },
    { area: 'International transfers (Ch. V)', triggers: ['third_party_processor'] },
    { area: 'Security of processing (Art. 32)', triggers: ['hardcoded_credential', 'embedded_url_password', 'insecure_http', 'public_webhook_no_auth', 'weak_webhook_auth', 'excessive_permissions', 'sensitive_logging', 'personal_credential_dependency'] },
    { area: 'Automated decision-making (Art. 22)', triggers: ['prompt_injection_exposure', 'unsafe_ai_tool_permissions', 'approval_unspecified'] },
  ],
};

const HIPAA = {
  name: 'HIPAA', areas: [
    { area: 'PHI involvement', triggers: ['special_category_data', 'pii_detected'] },
    { area: 'Access control §164.312(a)', triggers: ['public_webhook_no_auth', 'weak_webhook_auth', 'excessive_permissions'] },
    { area: 'Minimum-necessary use', triggers: ['data_minimisation'] },
    { area: 'Audit controls §164.312(b)', triggers: ['no_incident_notification', 'no_version_iteration', 'sensitive_logging'] },
    { area: 'Transmission security §164.312(e)', triggers: ['insecure_http', 'hardcoded_credential', 'embedded_url_password'] },
    { area: 'Business-associate agreements §164.308(b)', triggers: ['third_party_processor'] },
    { area: 'Authentication §164.312(d)', triggers: ['public_webhook_no_auth', 'weak_webhook_auth', 'personal_credential_dependency'] },
    { area: 'Integrity §164.312(c)', triggers: ['missing_error_handling', 'no_retry_configured', 'no_recovery_process'] },
    { area: 'Contingency / incident handling §164.308(a)(6/7)', triggers: ['no_incident_notification', 'no_exception_handling', 'no_recovery_process'] },
  ],
};

const SOC2 = {
  name: 'SOC 2', areas: [
    { area: 'Logical & physical access (CC6)', triggers: ['public_webhook_no_auth', 'weak_webhook_auth', 'excessive_permissions', 'hardcoded_credential', 'embedded_url_password', 'insecure_http', 'personal_credential_dependency'] },
    { area: 'Change management (CC8)', triggers: ['no_version_iteration', 'approval_unspecified', 'no_owner_assigned'] },
    { area: 'System operations (CC7)', triggers: ['missing_error_handling', 'no_retry_configured', 'no_recovery_process'] },
    { area: 'Risk mitigation (CC3/CC9)', triggers: ['prompt_injection_exposure', 'unsafe_ai_tool_permissions', 'browser_automation_risk'] },
    { area: 'Monitoring of controls (CC4/CC7.2)', triggers: ['no_incident_notification', 'sensitive_logging'] },
    { area: 'Incident response (CC7.3–7.4)', triggers: ['no_incident_notification', 'no_exception_handling', 'no_recovery_process'] },
    { area: 'Availability (A1)', triggers: ['no_retry_configured', 'missing_error_handling', 'no_recovery_process'] },
    { area: 'Confidentiality (C1)', triggers: ['pii_detected', 'special_category_data', 'sensitive_logging', 'insecure_http'] },
    { area: 'Processing integrity (PI1)', triggers: ['missing_error_handling', 'no_recovery_process'] },
  ],
};

const FRAMEWORKS = [GDPR, HIPAA, SOC2];

/**
 * Map findings to each framework's areas (4.1–4.3) and produce the table (4.4).
 * @returns {{disclaimer, frameworks: Array}}
 */
export function mapFrameworks(findings = []) {
  const byType = new Map();
  for (const f of findings) {
    if (!byType.has(f.type)) byType.set(f.type, []);
    byType.get(f.type).push(f);
  }

  const frameworks = FRAMEWORKS.map((fw) => {
    const areas = fw.areas.map((a) => {
      const hits = a.triggers.flatMap((t) => byType.get(t) || []);
      const worst = hits.reduce((w, h) => (RANK[h.severity] > RANK[w] ? h.severity : w), 'info');
      const status = a.notAssessed ? 'Not assessed' : hits.length ? 'Potential gap' : 'No gaps detected';
      return {
        area: a.area,
        status,                                   // Potential gap | No gaps detected | Not assessed
        severity: hits.length ? worst : null,     // worst severity among the gaps
        potential_gaps: [...new Set(hits.map((h) => h.title))],
        finding_types: [...new Set(hits.map((h) => h.type))],
        note: a.note || null,
      };
    });
    return {
      framework: fw.name,
      areas,
      gap_areas: areas.filter((a) => a.status === 'Potential gap').length,
      not_assessed: areas.filter((a) => a.status === 'Not assessed').length,
      assessed_areas: areas.filter((a) => a.status !== 'Not assessed').length,
    };
  });

  return { disclaimer: FRAMEWORK_DISCLAIMER, review: FRAMEWORK_REVIEW, frameworks };
}

export default { mapFrameworks, FRAMEWORK_DISCLAIMER };
