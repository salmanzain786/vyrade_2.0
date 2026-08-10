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
priority ordering, narrative embeds answers & marks blanks uncertain),
`tests/discoveryGenerate.test.js` (generation-reuse wiring, mocked). Full suite 593.

## Phase 3 — Organisation-wide Opportunity Discovery — ✅ done

Mode 2: detect recurring-work patterns across authorized task metadata → named
opportunities → manager review → Blueprint (via Phase 2 discovery).

**DECISION (plan's open question — reuse `opportunity_map` or not?):** a
**separate `work_opportunities` table**. The adoption `opportunity_map` is
per-user, keyed by a curated catalog area; task-sourced opportunities are a
different grain — org-level PATTERNS across many tasks/employees, carrying task
EVIDENCE. Forcing them together would corrupt both. We keep the shared
opportunity VOCABULARY (status lifecycle) but not one table. Documented in the SQL.

| Milestone | Status | Notes |
|---|---|---|
| 3.1 Pattern detection engine | ✅ **all 11 signals** | `patterns/detect.js` — **rules-based, explainable** (start-deterministic). Covers the spec's full list: (1) repeated names, (2) recurring, (3) **repeated subtasks** (child tasks by parent), (4) multi-person handoff, (5) copied-across-projects, (6) **long-running/overdue** (duration outliers from ingested dates), (7) **status churn** (frequent changes), (8) consistent-checklist (structural fingerprint), (9) **common-tool usage** (text heuristic over existing task text), (10) approval bottleneck, (11) reopened/rework (genuine back-transition). Name normalization canonicalizes dates/months/numbers; every finding carries **evidence** (task ids/projects); people counted via **hashed** refs only. |
| 3.2 Opportunity Map | ✅ | `patterns/opportunities.js` names findings like the spec ("Monthly report across 14 projects", "Lead cleanup repeated by 6 people") + directional est-hours (labelled). Persisted in `work_opportunities`; **upsert refreshes counts but never resets a human-set status**. `/work/opportunities`. |
| 3.3 Manager review flow | ✅ | Opportunities land as `suggested` — **nothing auto-approved**. Confirm / dismiss; a confirmed one → "Create Blueprint" starts a **Phase 2 discovery** on a representative task (human still refines before generation). Status lifecycle suggested → accepted → reviewing → blueprint_created. **Real manager review (client-review fix):** a `/work/opportunities/team` page (managers+) lists the whole team's opportunities via `listOrgOpportunities` (with creator shown), and `canActOnOpportunity` lets an owner/admin/**manager of the same org** confirm/dismiss a team member's opportunity — not just the creator. Reuses the org access model (`canReviewOpportunities`). Verified on the real DB: an owner acts on a member's opportunity; an unrelated user is denied. |
| 3.4 Analyse modes | ✅ | "**Analyse recurring work**" (all authorized tasks) and "**Analyse a project**" (one project) as distinct entry points. `POST /api/work/analyze { mode, project }`. |

**Verified on the real DB:** 6 tasks → 4 opportunities (`copied_across_projects`
"Monthly report across 3 projects", `consistent_checklist`, `recurring`,
`repeated_name`) matching the spec's examples; and re-running analysis **preserved
an accepted opportunity's status** (review isn't clobbered). Tests:
`tests/workPatterns.test.js` (normalization, all 11 signals incl. the 4 added
after the client's audit — repeated-subtask, long-duration with injected clock,
status-churn-distinct-from-reopened, common-tool — one-off-ignored,
naming/estimation, upsert-preserves-status). Full suite 606.

**Signal coverage note:** the initial ship covered 7–8 of the spec's 11 signals;
after the client's precise audit, the remaining ones were added — all using data
ALREADY ingested (dates, parent_id, status_history, task text), so no new capture
was needed, including a rules-based text heuristic for common-tool usage (#9).

**Org/manager scoping:** opportunities store `org_id`; `listOrgOpportunities`
supports an admin/manager view. Per the plan, deeper department-scoped review maps
onto the existing org model — foundation in place, richer scoping is a follow-on.

## Phase 4 — Automation Project Synchronisation (write-back) — ✅ done

Projects a task-sourced Blueprint's lifecycle back onto its originating task.

| Milestone | Status | Notes |
|---|---|---|
| 4.1 Write-back permission | ✅ | A **separate consent from read** — reuses the Phase-1 `scope.write_back_enabled` toggle (OFF by default). `writeback/sync.js` **refuses** any write when it's off (verified: read-enabled + write-off → `write_back_disabled`, no API call). |
| 4.2 Progress sync | ✅ | `writeback/lifecycle.js#deriveLifecycleStage` projects the spec's 10-stage lifecycle (clarification → requirements → architecture → cost → implementation prepared → security → testing → deployment → active → outcome) from Vyrade's EXISTING signals (blueprint status, workflow, governance scan, implementation) — no new tracking. `syncBlueprintProgress` posts an update comment to the task via the connector (`clickup.postComment`), **idempotently** (only when the stage advanced). **Automatic (client-review fix):** `autoSyncProgress` (fire-and-forget, best-effort) now fires at the real state-change events — after **workflow generation**, after a **governance scan**, and after **implementation confirm/activate/outcome** — so the task comment updates as the Blueprint actually advances, not only on click. The manual `POST /api/blueprints/[id]/sync-progress` button remains as an on-demand fallback. Auto-sync no-ops safely when unlinked / write-back-off / stage-unchanged, and never throws into the triggering action. |
| 4.3 Bi-directional linking | ✅ | `blueprint_task_links` — created at Blueprint generation (in `generate.js`, best-effort). Blueprint→task: the report page's write-back panel links to the task; task→Blueprint: each synced comment carries the Blueprint's report URL. Surfaced on both sides. |

**Verified on the real DB:** write-back OFF → refused with no API call; ON → the
gate opens and it attempts the platform write (throws at the live ClickUp call
with a fake token, proving it got past the gate). Tests: `tests/writeback.test.js`
(lifecycle derivation across all stages, permission gating on/off, idempotency,
not-linked). Full suite 618. Live write-back needs a real ClickUp token; the gate,
lifecycle projection, linking and comment payload are all built + tested.

## Phase 5 — Deeper Feature Integration — ✅ done

Weaves task data into Vyrade's existing features — reuse/wiring, not new logic.

| Milestone | Status | Notes |
|---|---|---|
| 5.1 Cost Intelligence enrichment | ✅ | `costSignals.js#taskCostSignals` derives frequency, assignees, process steps, est. manual time, **manual-review steps**, avg cycle time, related-task count from the originating task — surfaced on the report as a **"Task-derived cost inputs"** panel, **clearly labelled Estimated**. |
| 5.2 Contextual retrieval enrichment | ✅ (careful) | Systems/apps a task mentions are detected from EXISTING task text and fed into the discovery context + narrative, so the generated Blueprint's `systems` (which retrieval already keys on) reflect real tool usage. **Deliberately additive** — it improves what retrieval sees via the Blueprint, without touching live Pinecone retrieval code, which the plan flags needs real evaluation. That deeper change is documented as deferred. |
| 5.3 Automation Assurance linkage | ✅ | A new **entry point** into the already-built 8-phase scanner — not new scanning logic. Task-sourced Blueprints reach `/compliance/[id]` from the report, and the Opportunity Map now surfaces **"Blueprint" + "Assurance"** links on completed opportunities. |
| 5.4 AI Operations funnel | ✅ | `funnel.js#workFunnel` aggregates the full task→outcome funnel (tasks analysed → opportunities → accepted → Blueprints started → complete → implementations prepared → deployed → measured) from the Phase 2–4 tables — every stage is **real persisted state, not inferred**. `/admin/work-intelligence` renders it as a conversion funnel, reusing admin dashboard patterns + a "Work funnel" sidebar item. |

Verified on the real DB (funnel query executes over the live tables). Tests:
`tests/workPhase5.test.js` (funnel aggregation + conversion, cost-signal
derivation incl. review-step + cycle-time + not-linked, systems detection).
Full suite 625.

**This completes Phases 1–5 — the full single-platform Work Intelligence product.**
Deferred by plan: Phase 6 (more platforms — same connector pattern) and Phase 7
(auto-create draft Blueprint — behind explicit org opt-in).
