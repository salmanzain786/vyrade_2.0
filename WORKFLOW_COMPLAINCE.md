# Vyrade — Blueprint-Aware Governance & Compliance Scanner: Detailed Milestones

**Scope:** This is a major new capability, not an add-on to the export flow. The "previous scope" (upload → scan → vulnerabilities → compliance → assessment) is a real, buildable product on its own. The "expanded scope" — comparing a workflow against what the organisation *actually approved* in its Blueprint — is what makes this defensible and differentiated, but it depends on Blueprints capturing a level of structured policy detail they don't capture today. That's flagged clearly below as the single biggest scope decision, the same way the org/department model was the biggest decision in the Adoption Intelligence roadmap.

**Platform scope:** This scanner covers **n8n and Make.com only** — not Zapier, Claude Code/MCP packages, or custom Python. That's a meaningful scoping decision worth being explicit about, and it changes Phase 1 in particular: n8n and Make have genuinely different workflow formats (n8n's node/connection JSON vs. Make's scenario/module JSON, different credential-reference conventions, different webhook/trigger models, different error-handling surfaces), so "the parser" is really **two parsers sharing one output model**, not one parser with a format switch. This is reflected in the revised Phase 1 estimate below.

**Total estimated effort: ~52–68 working days (10.5–13.5 weeks), one developer full-time**, across 8 phases — up from the single-platform estimate to account for building and maintaining detection logic across two distinct workflow formats throughout Phases 1–3.

---

## Phase 1 — Workflow Scanner Core (structure + security)

**Why first:** Nothing else in this roadmap works without a real parser that understands workflow structure. This phase alone delivers the security half of "previous scope."

**Estimated time: ~13–16 days** (up from single-platform, since n8n and Make require genuinely separate parsing logic)

| Milestone | Detail | Est. time |
|---|---|---|
| 1.1 n8n workflow structure parser | Parse an n8n workflow JSON into a normalized internal model: nodes, connections, trigger type, branching/conditions, error paths, retry configuration, logging nodes. Vyrade already generates/exports this format, so real fixtures exist to test against immediately. | 2–3 days |
| 1.2 Make.com scenario structure parser | Parse a Make.com scenario/blueprint JSON into the **same normalized internal model** as 1.1 — modules instead of nodes, Make's routing/router modules instead of n8n's IF/Switch nodes, Make's own connection/credential referencing, its own error-handler module conventions. This is new parsing work, not a variant of 1.1 — the two formats don't share a structure, only a target output. **Also confirm now whether Vyrade currently exports Make scenarios at all**, or whether this scanner's Make support starts as upload-only (user brings their own Make scenario) until/unless Make generation exists elsewhere in the product. | 3–4 days |
| 1.3 Credential/secret exposure detectors (both platforms) | Hardcoded API keys, embedded passwords, insecure `http://` usage — reuses the pattern from `lib/security/redact.js`, but needs to read credential references correctly from **both** n8n's and Make's distinct credential-storage conventions. | 2 days |
| 1.4 Access/exposure detectors (both platforms) | Public webhook exposure without auth, missing/weak authentication, excessive access permissions, untrusted endpoints. n8n's webhook node and Make's webhook module have different default-security postures worth encoding explicitly (e.g., what "public by default" looks like differs between them). | 2–3 days |
| 1.5 AI-specific risk detectors (both platforms) | Prompt injection exposure, unsafe tool/MCP permissions — most directly reuses existing Claude-Code-export sanitization logic for the n8n/MCP side; Make's AI/OpenAI modules need their own equivalent check since Make doesn't share Vyrade's MCP export path at all. | 2 days |
| 1.6 Remaining structural/security checks (both platforms) | Browser-automation risk, personal-account credential dependency — same check, applied against each platform's own node/module and credential-naming conventions. | 2 days |

**Dependency:** None — can start immediately. **Recommend building n8n support first and fully** (1.1, then the relevant slices of 1.3–1.6), since Vyrade already generates that format and has the most real fixtures to test against — then layer in Make (1.2) once the shared output model is proven against real n8n data.

---

## Phase 2 — Privacy Analysis Layer

**Estimated time: ~7–9 days** (both platforms — Make's node/module set differs enough from n8n's that a couple of these need platform-specific handling, not just a shared rule applied twice)

| Milestone | Detail | Est. time |
|---|---|---|
| 2.1 PII field detection | Scan node/module parameter names/mappings for personal-information field patterns (email, phone, SSN/national ID, address, DOB, etc.) — a rules-based/keyword approach to start, not a full NLP classifier. Same logic across both platforms once each parser (1.1/1.2) normalizes to the shared model. | 2–3 days |
| 2.2 Special-category / health data detection | A narrower, higher-sensitivity keyword/pattern set (health, medical, diagnosis, biometric terms) — flagged as **higher severity** than general PII given HIPAA relevance. | 1 day |
| 2.3 Data minimisation / purpose limitation | Genuinely hard to fully automate — recommend this ships as a **flagged-for-manual-review** heuristic (e.g., "this node passes 12 fields to an external service; confirm all are necessary") rather than a false-confidence automatic pass/fail. | 1–2 days |
| 2.4 Retention / cross-border / third-party processor detection | Map known destination node/module types (Slack, Salesforce, a given cloud region) to a small reference table of processor/region metadata — needs separate entries for n8n's node-type identifiers and Make's module identifiers, since the same destination service is named/structured differently in each. | 3 days |

**Dependency:** Builds on Phase 1's parsers (both).

---

## Phase 3 — Operational Controls Analysis

**Estimated time: ~4–5 days**

| Milestone | Detail | Est. time |
|---|---|---|
| 3.1 Owner/approval/exception-owner checks | These come from **Blueprint metadata, not the workflow file itself** — a workflow JSON has no concept of "owner." This is really the first piece of Phase 6 (Blueprint comparison) sneaking in early; implement it here as a simple "is an owner assigned on the Blueprint" check. | 1 day |
| 3.2 Manual fallback / incident notification / acceptance criteria | Same as 3.1 — checks against Blueprint fields, not the raw workflow. | 1–2 days |
| 3.3 Change control / version history / recovery process | Mostly derivable from Vyrade's existing Blueprint versioning (already built) — confirm a version history exists and is non-trivial (more than one version = some iteration happened). | 1–2 days |

**Dependency:** Light dependency on Blueprint fields already existing (owner, acceptance criteria) — confirm these fields are actually populated in practice, not just present in schema.

---

## Phase 4 — Framework Mapping Engine

**Estimated time: ~7–9 days**

| Milestone | Detail | Est. time |
|---|---|---|
| 4.1 GDPR rule set | Map Phase 1–3 finding types to GDPR-relevant areas (personal-data processing, lawful basis, minimisation, retention, data-subject requests, third-party processors, international transfers, security controls, automated-decision-making concerns). This is a lookup/mapping table, not new detection logic — reuses everything already built. | 2–3 days |
| 4.2 HIPAA rule set | Same approach: map findings to HIPAA areas (PHI involvement, access restriction, minimum necessary use, audit controls, transmission security, business-associate dependencies, authentication, integrity, incident handling). | 2 days |
| 4.3 SOC 2 rule set | Map findings to SOC 2 trust-service areas (access control, change management, system operations, risk mitigation, monitoring, incident response, logical security, availability, confidentiality, processing integrity). | 2 days |
| 4.4 Framework mapping table generation | Produce the "Framework / Assessed areas / Potential gaps / Status" table format from the spec, driven by 4.1–4.3's mappings against whatever Phase 1–3 actually found. | 1–2 days |

**Dependency:** Needs Phases 1–3 producing real findings to map against.

**Important framing to carry into the UI:** per the spec's own repeated caution, this is a **gap assessment, not a certification** — worth baking that phrase into the report template itself, not just relying on remembering to say it.

---

## Phase 5 — Assessment Report Generation

**Estimated time: ~5–6 days**

| Milestone | Detail | Est. time |
|---|---|---|
| 5.1 Overall assessment summary | Governance readiness %, security risk level (Low/Medium/High), framework alignment status — a composite scoring function over Phases 1–4's findings, presented as a directional summary (same "don't overstate precision" principle as the Adoption Intelligence score). | 2 days |
| 5.2 Critical / high-priority findings sections | Severity-tiered findings list, formatted per the spec's example output. | 1 day |
| 5.3 Remediation recommendations engine | Each finding type maps to a standard remediation suggestion (e.g., "hardcoded credential" → "move into the platform's secret store"), with support for Blueprint-specific remediations once Phase 6 exists (e.g., "regenerate from Blueprint version X"). | 1–2 days |
| 5.4 Evidence & limitations section | Explicit, honest disclosure: what was detected from the uploaded workflow vs. inherited from the Blueprint vs. organisation policy vs. genuinely unavailable (configuration details, infrastructure). This section is what keeps the whole feature credible — worth treating as a first-class part of the report, not an afterthought. | 1 day |

**Dependency:** Needs Phases 1–4 as inputs. **This is the end of the standalone scanner — a real, shippable product on its own, matching the original "previous scope."**

---

## Phase 6 — Blueprint-Aware Comparison (the real differentiator — and the biggest open scope decision)

**Why this is the big one:** everything above treats the workflow in isolation. This phase is what lets Vyrade ask "does this match what was actually approved?" — but that question is unanswerable until Blueprints capture **structured policy requirements** they don't capture today. Right now, Vyrade's Blueprint fields (department, owner, objective, systems involved, platform recommendation, cost estimate, risk level, readiness, version, acceptance criteria) describe *what* is being built and *how it was scored* — not granular policy directives like "no external AI model," "retry limit of 3," or "org-owned credentials only." **This is a genuinely new Blueprint schema addition, comparable in scope to the org/department model flagged in the Adoption Intelligence roadmap — it should be an explicit decision, not an assumption.**

**Estimated time: ~13–17 days**

| Milestone | Detail | Est. time |
|---|---|---|
| 6.1 Governance & Policy Requirements schema | New structured fields on the Blueprint: required approvals (e.g., "before refunds," "before external communication"), approved data-handling rules ("no customer data to external AI models"), required/forbidden platforms or hosting model (self-hosted only, no third-party SaaS), credential ownership policy, retry/error-handling requirements, alerting requirements, log retention requirements. This needs UI work at Blueprint-creation time too, not just a schema change — someone has to actually enter these requirements. | 4–5 days |
| 6.2 Blueprint-vs-workflow diff engine | The core comparison logic: for each policy requirement in 6.1, check whether the scanned workflow (from Phases 1–3) actually satisfies it. Produces the specific violation types from the spec: approval missing, external model used, personal credential referenced, error branch missing, logging requirement absent. | 4–5 days |
| 6.3 Version-drift detection | Compare the workflow's origin against the Blueprint's *current* version — flag when a workflow was generated from an outdated Blueprint version (a real, distinct finding type per the spec). Reuses Vyrade's existing Blueprint versioning. | 2–3 days |
| 6.4 Report integration | Fold 6.2/6.3's findings into the Phase 5 report as their own section — this is what elevates "generic vulnerability scanning" into "does this match what we approved." | 3–4 days |

**Dependency:** Hard dependency on 6.1 — nothing else in this phase works without the schema existing, and 6.1 requires a product decision (see Open Questions below) before it's built.

---

## Phase 7 — Remediation Loop

**Estimated time: ~5–7 days**

| Milestone | Detail | Est. time |
|---|---|---|
| 7.1 "Regenerate from Blueprint" action | Reuse Vyrade's existing generation engine, seeded with the scan's findings so the regenerated workflow specifically addresses what was flagged (e.g., regenerating with the correct retry limit and an added approval step). | 2–3 days |
| 7.2 Resolution tracking | Mark individual findings as resolved/in-progress/accepted-risk, tied to a specific remediation action or regenerated version. | 2 days |
| 7.3 Reassessment | Re-run the scan against a remediated workflow and show before/after — this is what proves the loop actually closes, not just that a recommendation was made. | 1–2 days |

**Dependency:** Needs Phase 6 to know *what* to regenerate against.

---

## Phase 8 — AI Operations Dashboard Integration

**Estimated time: ~5–7 days**

| Milestone | Detail | Est. time |
|---|---|---|
| 8.1 Governance status per Blueprint | Surface readiness %, risk level, and framework status directly on the Blueprint view — reuses UI patterns already built for the Admin/Ops Dashboard. | 1–2 days |
| 8.2 Department/org-level governance rollup | Feeds directly into the "Risk and Governance" module already spec'd for the AI Adoption Intelligence executive dashboard (workflows without owners, sensitive data usage, missing approvals, outdated Blueprint outputs, unreviewed tools, duplicate platforms) — this phase is what actually populates that module with real data instead of placeholders. | 3–4 days |
| 8.3 Admin visibility | Reuses the existing internal admin dashboard infrastructure (already built) rather than creating a separate surface. | 1 day |

**Dependency:** Needs Phase 6/7 for real data, and benefits from the Adoption Intelligence org/department model existing if the rollup is to be department-level (otherwise this ships as Blueprint-level only, which is still useful on its own).

---

## Summary Timeline

| Phase | What it delivers | Est. time |
|---|---|---|
| 1 — Scanner core (structure + security, n8n + Make) | Real dual-platform parsing + security findings | 13–16 days |
| 2 — Privacy analysis | PII/health-data/retention findings | 7–9 days |
| 3 — Operational controls | Owner/approval/change-control checks | 4–5 days |
| 4 — Framework mapping | GDPR/HIPAA/SOC 2 gap tables | 7–9 days |
| 5 — Assessment report | The full report the spec describes | 5–6 days |
| **Subtotal — standalone scanner (ships on its own)** | | **36–45 days (7–9 weeks)** |
| 6 — Blueprint-aware comparison | The real differentiator | 13–17 days |
| 7 — Remediation loop | Resolution tracking + reassessment | 5–7 days |
| 8 — Dashboard integration | Governance status in AI Ops Dashboard | 5–7 days |
| **Total (all 8 phases)** | | **~52–68 days (10.5–13.5 weeks)** |

---

## Open questions worth settling before Salman starts

1. **Does Vyrade currently generate/export Make.com scenarios at all?** If not, Make support in this scanner starts as **upload-only** (a user brings their own existing Make scenario to be scanned) — worth confirming this explicitly, since it affects whether Phase 1.2 needs to also stand up Make export capability, or just Make *parsing*.
2. **Is the Blueprint-aware comparison (Phase 6) needed for v1, or does the standalone scanner (Phases 1–5) ship first as its own product?** Same fork as before — Phases 1–5 alone are a complete, valuable, shippable product across both platforms; Phase 6 is what makes it distinctive, but requires a real schema/UI investment worth committing to deliberately.
3. **Who defines the initial Governance & Policy Requirements taxonomy (6.1)?** A fixed, curated list to start (faster, easier to maintain) vs. a fully custom/free-form policy builder (more flexible, much more engineering).
4. **How much of the privacy/operational analysis should be "flagged for manual review" vs. automated pass/fail?** Recommend leaning toward manual-review flags for anything genuinely ambiguous — a false-confidence automated "pass" is a worse outcome than an honest "needs human review," consistent with the spec's own "gap assessment, not a certification" framing.
5. **Does this need real legal/compliance domain review before shipping the framework-mapping content (Phase 4)?** Worth budgeting as a parallel, non-engineering task rather than assuming the mapping table is correct once code-complete.
6. **Any plan to add Zapier or Claude Code/MCP coverage later?** Not in scope now per this document, but worth deciding whether the shared internal model (from 1.1/1.2) is designed with a third platform in mind from the start, since retrofitting a third parser is cheaper if the abstraction anticipated it.