# Compliance Mapping Review — GDPR / HIPAA / SOC 2

> **For a compliance/legal reviewer.** These area↔finding mappings power the
> scanner's framework "gap assessment". They are an engineering-reasonable first
> pass — please **confirm or correct** each one before it is shown to customers
> making compliance decisions. Source of truth: `lib/services/scanner/frameworks.js`.

**Current review status:** `unreviewed` — reviewer: _none_ · date: _—_

**How to review:** for each area, judge whether the listed finding types are
appropriate evidence of a potential gap in that area, and whether the statutory
citation is correct/complete. Mark **Verdict** = Confirm / Correct, and note any
change. Specific questions worth a hard look:
- GDPR *Automated decision-making (Art. 22)* — is `approval_unspecified` a fair proxy?
- HIPAA — are the `§164.312`/`§164.308` citation sets complete and correct?
- Any area where "Not assessed" should instead be a positive/negative finding.

## Finding-type glossary
- `hardcoded_credential` — A secret/API key literal embedded in a node
- `embedded_url_password` — A password inlined in a connection URL
- `hardcoded_webhook_secret` — A Slack webhook URL (itself a secret) hardcoded
- `insecure_http` — A plain http:// (non-TLS) external endpoint
- `public_webhook_no_auth` — An inbound webhook with no authentication
- `weak_webhook_auth` — Webhook auth weaker than header/JWT/HMAC (e.g. basic)
- `excessive_permissions` — OAuth scope list broader than a small allowance
- `prompt_injection_exposure` — External input flows into an AI prompt
- `unsafe_ai_tool_permissions` — An AI agent/tool with broad action permissions
- `missing_error_handling` — No error trigger/workflow/continue-on-fail
- `no_retry_configured` — External-call nodes with no retry
- `browser_automation_risk` — A headless-browser automation node
- `personal_credential_dependency` — A credential that looks like a personal account
- `pii_detected` — Personal-information fields (email/phone/DOB/…) handled
- `special_category_data` — Health/biometric/genetic/… special-category data
- `data_minimisation` — Many fields mapped to an external service (over-collection)
- `third_party_processor` — Data flows to a known third-party processor
- `consent_dependent_action` — Marketing/SMS send with no visible consent gate
- `sensitive_logging` — Personal/special-category data written to a log/audit sink
- `no_retention_control` — Personal data stored with no deletion/expiry mechanism
- `no_owner_assigned` — No owner on the Blueprint
- `approval_unspecified` — Human-approval requirement not decided
- `no_exception_handling` — No exception/manual-fallback rules
- `no_incident_notification` — No failure/incident notification
- `no_recovery_process` — No documented recovery-after-failure process
- `no_version_iteration` — Single Blueprint version (no change history)


## GDPR

| Area | Triggering finding types | Verdict (Confirm/Correct) | Reviewer comment |
|---|---|---|---|
| Personal-data processing (Art. 5/6) | `pii_detected`, `special_category_data` |  |  |
| Lawful basis & consent (Art. 6/7/9) | `consent_dependent_action`, `special_category_data` |  |  |
| Data minimisation (Art. 5(1)(c)) | `data_minimisation` |  |  |
| Storage limitation / retention (Art. 5(1)(e)) | `no_retention_control`, `sensitive_logging` |  |  |
| Data-subject rights / DSAR (Art. 15–17) | _not assessed_ — DSAR handling is an organisational capability declared on the Blueprint — assessed in Phase 6. |  |  |
| Third-party processors (Art. 28) | `third_party_processor` |  |  |
| International transfers (Ch. V) | `third_party_processor` |  |  |
| Security of processing (Art. 32) | `hardcoded_credential`, `embedded_url_password`, `insecure_http`, `public_webhook_no_auth`, `weak_webhook_auth`, `excessive_permissions`, `sensitive_logging`, `personal_credential_dependency` |  |  |
| Automated decision-making (Art. 22) | `prompt_injection_exposure`, `unsafe_ai_tool_permissions`, `approval_unspecified` |  |  |

## HIPAA

| Area | Triggering finding types | Verdict (Confirm/Correct) | Reviewer comment |
|---|---|---|---|
| PHI involvement | `special_category_data`, `pii_detected` |  |  |
| Access control §164.312(a) | `public_webhook_no_auth`, `weak_webhook_auth`, `excessive_permissions` |  |  |
| Minimum-necessary use | `data_minimisation` |  |  |
| Audit controls §164.312(b) | `no_incident_notification`, `no_version_iteration`, `sensitive_logging` |  |  |
| Transmission security §164.312(e) | `insecure_http`, `hardcoded_credential`, `embedded_url_password` |  |  |
| Business-associate agreements §164.308(b) | `third_party_processor` |  |  |
| Authentication §164.312(d) | `public_webhook_no_auth`, `weak_webhook_auth`, `personal_credential_dependency` |  |  |
| Integrity §164.312(c) | `missing_error_handling`, `no_retry_configured`, `no_recovery_process` |  |  |
| Contingency / incident handling §164.308(a)(6/7) | `no_incident_notification`, `no_exception_handling`, `no_recovery_process` |  |  |

## SOC 2

| Area | Triggering finding types | Verdict (Confirm/Correct) | Reviewer comment |
|---|---|---|---|
| Logical & physical access (CC6) | `public_webhook_no_auth`, `weak_webhook_auth`, `excessive_permissions`, `hardcoded_credential`, `embedded_url_password`, `insecure_http`, `personal_credential_dependency` |  |  |
| Change management (CC8) | `no_version_iteration`, `approval_unspecified`, `no_owner_assigned` |  |  |
| System operations (CC7) | `missing_error_handling`, `no_retry_configured`, `no_recovery_process` |  |  |
| Risk mitigation (CC3/CC9) | `prompt_injection_exposure`, `unsafe_ai_tool_permissions`, `browser_automation_risk` |  |  |
| Monitoring of controls (CC4/CC7.2) | `no_incident_notification`, `sensitive_logging` |  |  |
| Incident response (CC7.3–7.4) | `no_incident_notification`, `no_exception_handling`, `no_recovery_process` |  |  |
| Availability (A1) | `no_retry_configured`, `missing_error_handling`, `no_recovery_process` |  |  |
| Confidentiality (C1) | `pii_detected`, `special_category_data`, `sensitive_logging`, `insecure_http` |  |  |
| Processing integrity (PI1) | `missing_error_handling`, `no_recovery_process` |  |  |

## Sign-off

- [ ] Reviewer: ______________________  Role: ______________  Date: __________
- [ ] All areas Confirmed or Corrected above.
- [ ] After sign-off, set `FRAMEWORK_REVIEW = { status: 'reviewed', reviewer, reviewed_at }` in `frameworks.js`.
