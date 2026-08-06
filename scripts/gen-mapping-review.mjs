/**
 * Generate COMPLIANCE_MAPPING_REVIEW.md from the live framework mappings, so a
 * compliance/legal reviewer can confirm/correct each area↔finding mapping.
 *   node scripts/gen-mapping-review.mjs
 * Regenerate a FRESH round only when the mappings change (it overwrites the
 * reviewer's marks). The finding-type glossary is authored here for reviewers.
 */
import fs from 'node:fs';
import { describeFrameworkAreas, FRAMEWORK_REVIEW } from '../lib/services/scanner/frameworks.js';

const GLOSSARY = {
  hardcoded_credential: 'A secret/API key literal embedded in a node',
  embedded_url_password: 'A password inlined in a connection URL',
  hardcoded_webhook_secret: 'A Slack webhook URL (itself a secret) hardcoded',
  insecure_http: 'A plain http:// (non-TLS) external endpoint',
  public_webhook_no_auth: 'An inbound webhook with no authentication',
  weak_webhook_auth: 'Webhook auth weaker than header/JWT/HMAC (e.g. basic)',
  excessive_permissions: 'OAuth scope list broader than a small allowance',
  prompt_injection_exposure: 'External input flows into an AI prompt',
  unsafe_ai_tool_permissions: 'An AI agent/tool with broad action permissions',
  missing_error_handling: 'No error trigger/workflow/continue-on-fail',
  no_retry_configured: 'External-call nodes with no retry',
  browser_automation_risk: 'A headless-browser automation node',
  personal_credential_dependency: 'A credential that looks like a personal account',
  pii_detected: 'Personal-information fields (email/phone/DOB/…) handled',
  special_category_data: 'Health/biometric/genetic/… special-category data',
  data_minimisation: 'Many fields mapped to an external service (over-collection)',
  third_party_processor: 'Data flows to a known third-party processor',
  consent_dependent_action: 'Marketing/SMS send with no visible consent gate',
  sensitive_logging: 'Personal/special-category data written to a log/audit sink',
  no_retention_control: 'Personal data stored with no deletion/expiry mechanism',
  no_owner_assigned: 'No owner on the Blueprint',
  approval_unspecified: 'Human-approval requirement not decided',
  no_exception_handling: 'No exception/manual-fallback rules',
  no_incident_notification: 'No failure/incident notification',
  no_recovery_process: 'No documented recovery-after-failure process',
  no_version_iteration: 'Single Blueprint version (no change history)',
};

const esc = (s) => String(s).replace(/\|/g, '\\|');
const defs = describeFrameworkAreas();

let md = `# Compliance Mapping Review — GDPR / HIPAA / SOC 2

> **For a compliance/legal reviewer.** These area↔finding mappings power the
> scanner's framework "gap assessment". They are an engineering-reasonable first
> pass — please **confirm or correct** each one before it is shown to customers
> making compliance decisions. Source of truth: \`lib/services/scanner/frameworks.js\`.

**Current review status:** \`${FRAMEWORK_REVIEW.status}\` — reviewer: ${FRAMEWORK_REVIEW.reviewer || '_none_'} · date: ${FRAMEWORK_REVIEW.reviewed_at || '_—_'}

**How to review:** for each area, judge whether the listed finding types are
appropriate evidence of a potential gap in that area, and whether the statutory
citation is correct/complete. Mark **Verdict** = Confirm / Correct, and note any
change. Specific questions worth a hard look:
- GDPR *Automated decision-making (Art. 22)* — is \`approval_unspecified\` a fair proxy?
- HIPAA — are the \`§164.312\`/\`§164.308\` citation sets complete and correct?
- Any area where "Not assessed" should instead be a positive/negative finding.

## Finding-type glossary
${Object.entries(GLOSSARY).map(([k, v]) => `- \`${k}\` — ${v}`).join('\n')}

`;

for (const fw of defs) {
  md += `\n## ${fw.framework}\n\n| Area | Triggering finding types | Verdict (Confirm/Correct) | Reviewer comment |\n|---|---|---|---|\n`;
  for (const a of fw.areas) {
    const trig = a.not_assessed ? `_not assessed_${a.note ? ' — ' + esc(a.note) : ''}` : a.triggers.map((t) => `\`${t}\``).join(', ') || '_none_';
    md += `| ${esc(a.area)} | ${trig} |  |  |\n`;
  }
}

md += `\n## Sign-off\n\n- [ ] Reviewer: ______________________  Role: ______________  Date: __________\n- [ ] All areas Confirmed or Corrected above.\n- [ ] After sign-off, set \`FRAMEWORK_REVIEW = { status: 'reviewed', reviewer, reviewed_at }\` in \`frameworks.js\`.\n`;

fs.writeFileSync('COMPLIANCE_MAPPING_REVIEW.md', md);
const areaCount = defs.reduce((n, f) => n + f.areas.length, 0);
console.log(`Wrote COMPLIANCE_MAPPING_REVIEW.md — ${defs.length} frameworks, ${areaCount} areas.`);
