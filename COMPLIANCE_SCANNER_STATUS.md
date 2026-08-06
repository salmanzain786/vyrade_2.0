# Governance & Compliance Scanner — Phase 1 status

Companion to `WORKFLOW_COMPLAINCE.md` (the plan). Tracks what's built and the
decisions the client's review raised.

## Phase 1 — Scanner core (structure + security)

| Milestone | Status | Notes |
|---|---|---|
| 1.1 n8n parser | ✅ Done | `lib/services/scanner/n8nParser.js` — verified on real Vyrade workflows |
| **1.2 Make parser** | ✅ **Done (upload-only)** | `makeParser.js` — parses Make "Export Blueprint" JSON (flow/modules/routers/mapper) into the shared model |
| 1.3 Credential/secret detectors | ✅ Done | reuses `redactSecrets`; hardcoded secrets, embedded URL passwords, insecure `http://` |
| **1.4 Access/exposure** | ✅ **Done (all 3 checks)** | no-auth **+ weak-auth (review) + excessive OAuth scopes (review)** |
| 1.5 AI-specific risk | ✅ Done | prompt-injection exposure, unsafe AI-tool/agent permissions |
| 1.6 Structural/security | ✅ Done | missing error handling, **retry-not-configured**, browser-automation, personal-credential |

**Reproducible real-workflow verification (client review #5):** a REAL
Vyrade-generated 19-node workflow — redacted of secrets/emails/doc-ids (0 secrets
remaining, asserted) — is committed at
`tests/fixtures/scanner/vyrade-n8n-export.json` and scanned by
`tests/scannerFixture.test.js`. So the "verified on real workflows" claim is now
**checkable in CI**, not just a manual dev run. It surfaces
`missing_error_handling`, `pii_detected`, `third_party_processor`,
`no_retry_configured`, `sensitive_logging`, `no_retention_control` (risk High).

Shared model + orchestrator: `model.js`, `scan.js`. API: `POST /api/scanner/scan` (auth-gated).
Every finding has a stable `type` slug (e.g. `public_webhook_no_auth`,
`prompt_injection_exposure`) for Phase 4 framework mapping; ambiguous checks are
marked `manual_review` per the spec's "gap assessment, not certification".

## Decisions resolved from the client review

### 1. Does Vyrade export Make scenarios? → **NO → Make is upload-only**
`makeExporter.js` emits a **markdown implementation guide, not an importable
scenario file** (it says so explicitly). So the scanner's Make support is
**upload-only**: the user brings a Make "Export Blueprint" JSON. `makeParser.js`
parses that standard format. No Vyrade-generated Make fixtures exist, so Make is
tested against representative hand-built scenarios.

### 2. 1.4 was partial → **now complete**
Added the two missing checks the spec called for:
- **Weak auth** — webhook auth weaker than header/JWT/HMAC (e.g. basic) →
  `weak_webhook_auth` (Medium, review).
- **Excessive permissions** — OAuth scope lists broader than a small allowance
  (>4) → `excessive_permissions` (Medium, review).

### 3. Retry analysis — **decision: split across Phase 1 and Phase 6**
- **Phase 1 owns the GENERIC check** (now implemented): external-call nodes with
  no retry configured → `no_retry_configured` (Low, review). The n8n parser now
  extracts `retryOnFail`/`maxTries`.
- **Phase 6 owns POLICY-specific limits** (e.g. "retry limit of 3" as an approved
  Blueprint requirement) — that's a comparison against declared policy, not
  generic scanning, so it belongs with the Blueprint-vs-workflow diff engine.

This split means retry is no longer silently dropped between phases: the generic
"is retry configured at all" lives in Phase 1; the "does it match the approved
limit" lives in Phase 6.

## Phase 2 — Privacy analysis (✅ done, both platforms)

`lib/services/scanner/privacy.js`, run by the orchestrator after the security
detectors. All checks work across n8n + Make via the shared model.

| Milestone | Status | Finding type |
|---|---|---|
| 2.1 PII field detection | ✅ | `pii_detected` (Medium) — email/phone/national-id/address/DOB/name/card/IP, matched on field NAMES + mappings (snake/camel-case normalised) |
| 2.2 Special-category / health | ✅ | `special_category_data` (High, review) — health/biometric/genetic/mental-health/ethnicity/religion/orientation/criminal |
| 2.3 Data minimisation | ✅ | `data_minimisation` (Low, **manual review**) — flags a node mapping >10 fields to an external service ("confirm all necessary"), not a false-confidence pass/fail |
| 2.4 Retention / cross-border / processor | ✅ | `third_party_processor` (Low, review) — a PROCESSOR table matching BOTH n8n node-types and Make module ids to the same service, with region + international-transfer + retention/DPA notes |
| 2.5 Consent-dependent actions | ✅ | `consent_dependent_action` (Medium, **manual review**) — flags a marketing-email / SMS-channel send (Mailchimp, SendGrid, Klaviyo, Twilio, …) with no visible upstream consent/opt-in gate; suppressed when a consent signal exists. Excludes transactional email (gmail/smtp) to avoid false positives. |

| 2.6 Logging of sensitive information | ✅ | `sensitive_logging` — PII/special-category written to a **log/audit sink** (logging service, or a store whose target is named "log"/"audit", or a node named as a log). **Elevated severity**: PII→High, special-category→Critical (vs. Medium/High to a normal service), because logs persist and are broadly visible. Does not fire for non-log destinations. |

| 2.7 Data retention | ✅ | `no_retention_control` (Low, **manual review**) — workflow **writes personal data to a persistent store** (DB/Sheets/S3/Airtable/…) with **no visible deletion/expiry/TTL/cleanup** step. Gated on PII (targeted, not noisy); suppressed when a delete/cleanup/TTL mechanism exists or the write has no personal data or is read-only. |

**Manual-review-split decisions (client reviews):** retry, consent, and
retention all follow the same rule — **Phase 2 owns the generic,
structurally-inferable heuristic** (manual-review flag); **Phase 6 owns the
policy-explicit version** declared on the Blueprint (retry limit N, "consent
required before X", "retain N days" + deletion/access/DSAR). Nothing deferred
silently, nothing a false-confidence auto-pass.

**Deletion & access requirements (DSAR / data-subject rights) → PHASE 6
(decided, documented).** Not implemented in Phase 2 and, unlike retention, has
**no Phase 2 half**: whether the org can fulfil a GDPR/CCPA deletion/access
request is a cross-system organizational capability, not inferable from one
workflow's structure. Owned entirely by Phase 6's Blueprint policy comparison
(same home as retry limits). Recorded as a code comment in `privacy.js`; the
`third_party_processor` finding (2.4) already surfaces DSAR as a consideration
in its remediation text.

Verified on real Vyrade workflows: the email/spreadsheet workflows surface
`pii_detected` + `third_party_processor` alongside the security findings.

## Phase 3 — Operational controls (✅ done)

`lib/services/scanner/operationalControls.js` — reads BLUEPRINT metadata +
version history (not the workflow file). Run by `scanWorkflow` when Blueprint
context is passed, and by `POST /api/scanner/scan { blueprintId }` (full scan).

| Milestone | Status | Finding |
|---|---|---|
| 3.1 Owner / approval | ✅ | `no_owner_assigned` (owner = user_id absent) · `approval_unspecified` (human_approval.required is null) |
| 3.2 Manual fallback / incident notification | ✅ | `no_exception_handling` (empty exception_rules) · `no_incident_notification` (empty notification_rules) |
| 3.4 Recovery process (distinct from 3.2) | ✅ | `no_recovery_process` — derived from a retry `after_final_failure` action or an exception behavior describing recovery (restart/resume/reconcile/replay/rollback/restore). Manual fallback = handle a failure; recovery = restore to a working state afterward. Real data: 10/15 lack it. |
| 3.3 Change control / version history | ✅ | `no_version_iteration` (≤1 stored version) |

**Confirmed populated in practice (the doc's dependency), not just in schema.**
Across 15 real blueprints: 9 lack exception handling, 10 are single-version, 7
lack notification, 2 have no owner — and **0** `approval_unspecified` (real
blueprints DO record the approval decision). So the checks are meaningful, not
always-firing. All findings are **manual review** (governance, not auto-pass).

**NOT captured today → Phase 6 (documented in code, not per-scan findings):**
`acceptance_criteria` (no such field), dedicated accountable-owner /
approval-owner / exception-owner fields (only creator `user_id` exists),
policy-explicit approval directives, and **monitoring requirements** (client
review: ongoing error-rate thresholds / SLA targets / "what to watch" — no field
exists; `volume.estimated_executions` is on every blueprint so a check keyed on
it never fires, and `latency_requirement` is a performance constraint, not a
monitoring plan → Phase 6 schema addition, not a noisy Phase 3 heuristic). Same
reasoning as DSAR.

## Phase 4 — Framework mapping (✅ done)

`lib/services/scanner/frameworks.js` — a PURE lookup mapping the stable finding
`type` slugs from Phases 1–3 to **GDPR / HIPAA / SOC 2** areas (no new detection).
Added to every scan result as `framework_mapping`.

| Milestone | Status |
|---|---|
| 4.1 GDPR rule set | ✅ 9 areas (processing, lawful basis/consent, minimisation, retention, DSAR*, processors, transfers, security, ADM) |
| 4.2 HIPAA rule set | ✅ 9 areas (PHI, access, minimum-necessary, audit, transmission, BAA, authentication, integrity, contingency) |
| 4.3 SOC 2 rule set | ✅ 9 areas (access CC6, change CC8, ops CC7, risk CC3/9, monitoring CC4, incident CC7.3, availability A1, confidentiality C1, integrity PI1) |
| 4.4 Table generation | ✅ per-area `{ status, severity, potential_gaps, finding_types, note }` → the "Framework / Assessed areas / Potential gaps / Status" table |

Status values: **Potential gap** (a finding maps here) · **No gaps detected**
(assessable, none found — NOT "compliant") · **Not assessed** (needs Blueprint
policy / manual or legal review, e.g. *DSAR). Real fixture → GDPR 5 gaps/1
not-assessed, HIPAA 4, SOC 2 5.

**"Gap assessment, not a certification"** is baked into the engine as
`FRAMEWORK_DISCLAIMER` and returned with every mapping — so the report/UI can't
forget it. Absence of a finding never claims compliance.

### Legal/compliance review of the mapping content — REQUIRED, externally owned

The GDPR/HIPAA/SOC 2 mappings are engineering-reasonable, **not legal advice**.
Whether each area↔finding mapping and statutory citation is legally accurate is a
domain-expert call. This is **not an engineering task** — it must be sourced from
a qualified compliance/legal reviewer. Engineering has set it up so it can't be
shipped as authoritative before that happens:

- **Product gate (code):** `FRAMEWORK_REVIEW.status = 'unreviewed'` in
  `frameworks.js`; `mapFrameworks` returns a `review` object with a warning
  ("NOT yet reviewed by a compliance professional — do not present as
  authoritative"). The report/UI must surface this until sign-off.
- **Reviewer artifact:** `COMPLIANCE_MAPPING_REVIEW.md` (regenerate with
  `npm run review:mapping`) — every area, its triggering finding types, a
  finding-type glossary, and Confirm/Correct + comment columns, plus the specific
  questions to scrutinise (e.g. is `approval_unspecified` right for GDPR Art. 22;
  are the HIPAA §164.312/§164.308 citations complete). Ends with a sign-off block.
- **On sign-off:** the reviewer's corrections go into `frameworks.js`, then set
  `FRAMEWORK_REVIEW = { status:'reviewed', reviewer, reviewed_at }` — which clears
  the warning in the product.

**Owner: you (source an external compliance/legal reviewer). Status: PENDING.**

## Phase 5 — Assessment Report Generation — ✅ done

`lib/services/scanner/report.js` — `generateAssessmentReport()` over the Phase
1–4 outputs, attached to every scan as `report`. **This is the end of the
standalone scanner — a shippable assessment product on its own.**

| Milestone | Status |
|---|---|
| 5.1 Overall assessment summary | ✅ `governance_readiness_pct` (+ band) + `security_risk_level` + `framework_alignment`. Directional: readiness deducts per DISTINCT finding type (not per node), so repetition doesn't crater the score. Real fixture → **70% Moderate / High risk**. |
| 5.2 Critical / high-priority findings | ✅ `priority_findings.{critical, high}`, severity-tiered |
| 5.3 Remediation recommendations | ✅ aggregated by type, prioritised, with affected nodes + a **Phase 6 Blueprint-remediation hint** on governance items |
| 5.4 Evidence & limitations | ✅ first-class: what was detected from the **workflow** vs. inherited from the **Blueprint** (or not, if no context) vs. **not assessed** (Phase 6 / manual) vs. **out of scope** (infra/runtime/secret values/org policy). Carries the "gap assessment, not certification" disclaimer + the pending-legal-review flag. |

Presented as a directional summary (same "don't overstate precision" principle),
never a certification, and honest about coverage.

**Customer-facing UI — ✅ done.** `app/compliance/[id]/page.js` — a
server-rendered, ownership-gated page (mirrors `app/report/[id]`) that runs the
scan and renders the report for a human: readiness score + band, security-risk
and findings tiles, per-framework alignment cards, critical/high findings,
aggregated remediations, and the full Evidence & Limitations section — plus the
gap-assessment and pending-legal-review banners up top. Reachable via a
**"Governance & Compliance"** link in the Blueprint report header
(`/report/[id]` → `/compliance/[id]`). Closes the "report data exists but nobody
can see it" gap: the report is now viewable, not just an API payload.

**Scan persistence + history — ✅ done.** `sql/governance_scans.sql` (+ Drizzle
mirror + migrate wiring) stores each scan as an immutable, timestamped snapshot
tied to the Blueprint: headline metrics denormalised into columns (readiness,
risk, findings, worst severity) for cheap comparison, full findings/report/
framework payloads snapshotted as JSON. `scanContext()` is the one shared
compute path (route + page + persistence agree). Repository:
`saveScan` (best-effort — a persistence failure never breaks the scan response),
`getScanHistory`, `getLatestScan`. The API route persists every blueprint-scoped
scan and returns `previous` + `readiness_delta`; the page renders the latest
persisted snapshot (computing + persisting a baseline on first view), shows a
**readiness delta vs. the previous scan**, a **Scan history** table, and a
**"Re-scan now"** button. Closes the "scans aren't persisted — no history, no
before/after" gap and lays the groundwork Phase 7 (Remediation Loop) needs:
reassessment now has a real baseline to compare against. 6 persistence tests
(`tests/scanPersistence.test.js`).

## Deferred to Phase 6 (decided & tracked — not gaps, not silent)

These need a NEW Blueprint field/schema (Phase 6), so they are deliberately NOT
Phase 2/3 checks. Each is disclosed in code; consolidated here so it's tracked
in one place, not only in comments.

| Item | Why Phase 6 (not now) |
|---|---|
| **Distinct owner roles** — workflow owner / **approval owner** / **exception owner** (3 separate roles per the spec) | Today only the creating `user_id` exists (the general owner). Approval-owner and exception-owner are new accountability fields. Phase 3's `no_owner_assigned` covers the general owner only — confirmed intentional. |
| DSAR — deletion & access (data-subject rights) | Cross-system org capability, not inferable from a workflow. |
| `acceptance_criteria` | No such field exists. |
| Monitoring requirements (error-rate thresholds, SLA targets, "what to watch") | No field; `volume` is always present (check never fires), `latency` is a perf constraint. |
| Policy-explicit directives — retry limit N, "consent required before X", "retain N days", recovery-runbook | The generic/structural half is already checked in Phase 1–3; the policy-specific limits are Blueprint-declared → Phase 6 diff engine. |

## Still open (product decisions, not code)
- Phase 6 (Blueprint-aware comparison) in v1, or ship Phases 1–5 standalone first?
- Who owns the Governance & Policy Requirements taxonomy (6.1)?
- Legal/compliance review of the framework-mapping content (Phase 4)?
