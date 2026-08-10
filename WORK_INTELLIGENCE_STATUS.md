# Work Intelligence (Task-to-Automation) — build status

Companion to `TASK_MANAGEMENT_DOC.md` (concept) and `TASK_MANAGEMENT_PHASES.md`
(plan). Ships as a connected capability under Integrations, starting narrow
(ClickUp, employee-initiated) per the spec.

## Phase 1 — Foundation: Connection Setup & Governance — ✅ done

The spec's non-negotiable prerequisite: consent, scope, retention, redaction —
"Vyrade should not automatically read the entire workspace without clear
authorisation" and "avoid positioning this as employee surveillance."

| Milestone | Status | Notes |
|---|---|---|
| 1.1 OAuth connector framework | ✅ | Pluggable per-platform interface (`connectors/registry.js` + `base` contract): authorizeUrl / exchangeCode / refresh / revoke / getAccount / listSpaces / listLists / fetchTasks. **Tokens encrypted at rest** (AES-256-GCM, `tokenCrypto.js`, key from `WORK_INTEL_KEY`/`AUTH_SECRET`). OAuth routes: `/api/integrations/[platform]/connect` (signed state) → `/callback` (exchange + store) → `DELETE` (revoke, drops tokens). `connectionRepository` (one active connection per user+platform). |
| 1.2 Pilot — ClickUp task retrieval | ✅ | `connectors/clickup.js` — real OAuth + team/space/list discovery + task retrieval (subtasks/closed included), mapped into the normalized `taskModel` (name, description, status, assignees, checklist, subtasks, tags, recurrence, dates, custom fields, url). |
| 1.3 Connection setup UX | ✅ | `/integrations/task-management` + `ConnectionSetup` — the full scope screen: fields analysed (description/checklist/status-history/comments/attachments/custom), read + **separate write-back** toggle, historical range, sensitive-data rules. **Reads nothing by default** (no projects selected, comments/attachments/write-back OFF). `scope.js` normalises + `isProjectInScope` requires explicit selection. |
| 1.4 Governance & consent | ✅ | `governance.js` — retention window (**default 90 days**, enforced by `purgeExpiredTasks` + a `retention_expires_at` stamp), opportunity visibility (managers/admins/employee), employee notification (notify/consent-required/silent), consent mode (org-authorised / employee-opt-in), and **personal-performance inference OFF by design**. `connection_optouts` table for employee opt-out. |
| 1.5 Sensitive-data on ingest | ✅ | `sanitizer.js` **reuses `redactSecrets`** (scanner) + strips emails/phones + **hashes assignee identity** (HMAC — "personal performance is not inferred"). Applied to name/description/checklist before storage. Verified on real data: a task with a Stripe key, email, phone and assignee → all redacted/hashed, **nothing sensitive reached storage**. |

**Scope decisions (per the plan's open questions):** pilot = **ClickUp**;
retention default = **90 days**; consent = **org-authorised + notify + per-employee
opt-out** by default (tightenable to employee-opt-in); tokens **encrypted at rest**;
redaction **reuses** the scanner utility.

**Honest scope:** live OAuth needs a real ClickUp app (`CLICKUP_CLIENT_ID/SECRET`
— documented in `.env.example`); the setup screen shows a clear "not configured"
state until then. Everything else (connector, token crypto, scope/governance
model, ingest+redaction, retention) is built and tested without needing a live
platform. This is the foundation; opportunity detection is Phase 2/3.

Tests: `tests/workIntelligence.test.js` (token crypto round-trip, ClickUp
normalization, redaction/hashing, scope+governance defaults), `tests/connectionRepo.test.js`
(tokens encrypted at rest, never leaked to client). 14 tests; ingest verified
end-to-end on the real DB (no sensitive-data leakage, retention stamped).
