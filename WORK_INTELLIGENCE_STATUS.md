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

### Sync pipeline assembled (client review fix)

The individual pieces existed but were never wired into a runnable pipeline —
`ingestTasks`, `isProjectInScope`, and `connection_optouts` had no callers. Now
assembled:
- **`sync.js#syncConnection`** — the orchestration: for each in-scope list
  (`isProjectInScope`), fetch via the connector, **exclude tasks assigned to an
  opted-out employee** (`connection_optouts`, matched on id AND email), apply
  field-level scope, sanitize, `ingestTasks`, then `purgeExpiredTasks` (retention).
- **`POST /api/integrations/[platform]/sync`** — the "Sync now" action.
- **`optouts.js` + `/optouts` API** — add/list/remove employee opt-outs (hashed).
- **UI** — project include/exclude inputs, a **Sync now** button (shows ingested /
  excluded counts), and opt-out management in `ConnectionSetup`.
- **Bug caught by the new e2e test:** opt-out matching hashed only the assignee
  *id*, but opt-outs are added by *email* — fixed to match on both.

Verified end-to-end on the real DB: 3 fetched → 1 excluded by opt-out (that task
NOT stored) → 2 ingested → L2 excluded from fetch → secret + email redacted
through the pipeline. Tests: `tests/workIntelligenceSync.test.js` (5 e2e cases:
scope filter, opt-out exclusion, reads-nothing-when-unscoped, read-disabled,
field-scope drop). Full suite 582.

## Phase 2 — Employee-Initiated Automation Discovery — ✅ done

Mode 1: one task → focused clarification → a real draft Blueprint (via the
EXISTING generation engine, not a parallel one).

| Milestone | Status | Notes |
|---|---|---|
| 2.1 "Explore Automation With Vyrade" | ✅ | Task browser at `/work/tasks` (lists ingested tasks) + `ExploreButton` → starts a discovery session. `POST /api/work/discovery`. |
| 2.2 Context retrieval & normalization | ✅ | `discovery/context.js#buildTaskContext` reads the ingested task into a structured context + **rules-based signal detection** (recurring / multiple-sources / drafting / approval / external-delivery / handoff / **rework** / **linked-work**). **Fuller context added (client-review fix):** comments, attachments (metadata/links only), related/linked task ids, and an accumulated status-history are now captured — **gated by the existing `scope.fields` opt-in toggles** (comments/attachments OFF by default, so the conservative footprint is unchanged; captured only when an org opts in, redacted the same way). status_history builds real transitions observed across syncs. Verified on the real DB: comments-OFF stores 0 comments; comments-ON stores 1 (redacted); `open → review` transition accumulated. |
| 2.3 Process-discovery clarification | ✅ | `discovery/clarification.js` — LLM-driven (`client.chat.completions`, JSON mode) with a **deterministic curated fallback** (the spec's questions, signal-gated), so it works and is testable without an API key. Never blocks on an LLM hiccup. |
| 2.4 Draft Blueprint from task + answers | ✅ | `discovery/narrative.js` builds a process brief from task + answers; `discovery/generate.js` feeds it to **`createInitialBlueprint` (the existing engine)** — no parallel generator. Unanswered questions are marked **explicitly uncertain**, never guessed. Session linked to the Blueprint. |
| 2.5 Architecture + cost wiring | ✅ (inherent) | Because the draft is a NORMAL Blueprint (created via the standard path), the platform-recommendation and cost engines run over it unchanged, and it appears in the report/compliance/adoption surfaces. Zero new logic. |

**Verified on the real DB:** the spec's "Monthly SEO reporting" task → signals
`recurring, multiple_sources, drafting, approval, external_delivery` → 9 focused
questions → a narrative that embeds the answers and flags blanks as
uncertain/needs-clarification → session persisted and reloaded. The final
generation step reuses the existing, already-tested Blueprint engine (a billed
LLM call, gated behind the user's "Generate draft Blueprint" action).

UI: `/work/tasks` (picker), `/work/discovery/[id]` (clarification flow →
"Generate draft Blueprint" → `/report/[id]`). Reachable from the connection page.
Tests: `tests/taskDiscovery.test.js` (signal detection, clarification fallback +
priority ordering, narrative embeds answers & marks blanks uncertain). Full suite 588.
