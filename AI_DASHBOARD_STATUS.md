# AI Adoption Intelligence — build status

Companion to `AI_DASHBOARD.md` (the plan). Tracks what's built and the scope
decisions taken. Phase 1 is single-user and builds entirely on the existing
users + Blueprint model — **no org/multi-tenant model** (that's Phase 2).

## Phase 1 — Profile + Blueprint Intelligence — ✅ done

| Milestone | Status | Notes |
|---|---|---|
| 1.1 Progressive profiling | ✅ | `user_profiles` table + `profileRepository` (read-merge-write, `completed` flips once role+department+industry present) + `GET/PUT /api/profile` + `ProfileForm` on `/dashboard/profile`. **Hybrid capture per the spec:** the minimum (role, department, industry) is captured at **registration** (optional fields on the signup form → `registerUser` seeds the profile + opportunity map immediately, best-effort/never blocks signup), and the rest is prompted **contextually** on first dashboard visit. Verified: a signup with department=finance seeds a finance-specific map from day one (not generic-only). |
| 1.2 Personalised opportunity map | ✅ | **Curated** catalog (`catalog.js`, role/dept → workflow areas — Marketing/Finance/Support/… examples) over an LLM call, per the spec. `opportunity_map` table seeded idempotently (INSERT IGNORE) from the profile; per-area lifecycle status. Upgradeable to LLM-personalised later without storage changes. |
| 1.3 Progression-stage events | ✅ | 9-stage taxonomy (`stages.js`); `adoption_events` table (same append-only/best-effort **pattern** as `operational_events`, separate table — journey events, not ops telemetry). Wired: **blueprint_started** + **blueprint_complete** (blueprintService), **architecture_selected** + **implementation_prepared** (generate-workflow route). Discovered/Considered fire from the opportunity-status API. Implemented/Active/Measured are Phase-3 confirmation only — kept at 0, stated honestly. |
| 1.4 Adoption Score | ✅ | `adoptionScore.js` — a **directional index** (0–100) with a documented, **adjustable `WEIGHTS` config** (not buried in the UI) and a per-signal breakdown (no black box). Explicit "not a precise measurement" caveat. Signals derived from **durable tables** (blueprints, generated workflows, governance scans, opportunity map) so they're robust without event backfill. Verified on a real user → **63 (Adopting)**. |
| 1.5 Dashboard UI | ✅ | `/dashboard` ("Your AI Adaptability") — score + maturity band, score breakdown, 9-stage progression, coverage, recommended next actions, opportunity map with status controls, skills. Reachable from the app header (UserMenu → "Dashboard"). |
| 1.6 Coverage + estimated potential | ✅ | "N of M opportunities addressed" + estimated hours/month, **explicitly labelled "Estimated"** (amber badge) — real figures await Phase 4 telemetry. Top high-impact gaps ranked by estimated hours. |
| 1.7 Skills & readiness | ✅ | Derived from `technical_skill`, cross-referenced against the complexity (no-code/low-code/api) of areas the user has engaged. |

**Scope decisions (made & documented):**
1. **Contextual profile capture**, not signup front-loading (spec's own guidance).
2. **Curated opportunity mapping**, not per-signup LLM (spec's recommendation) — deterministic, hand-tunable; `catalog.js` is the tuning surface.
3. **Score = directional index** with an adjustable weight config + visible breakdown + explicit caveat; never "scientifically exact" (spec's caution).
4. **Estimates labelled as estimates** everywhere (1.6) until Phase 4 telemetry.
5. Adoption events **reuse the operational-events pattern** but a **separate table** (concern separation).
6. Score signals come from **durable tables**, so they work for existing users without event backfill; `adoption_events` drive the journey display.

**Not in Phase 1 (correctly deferred):** Implemented/Active/Measured confirmation
(Phase 3); org/department rollups (Phase 2 — needs the multi-tenant model); real
(vs. estimated) hours/cost (Phase 4 telemetry).

## Phase 2 — Organisational Dashboard — ✅ done

The multi-tenancy layer. **Additive & non-breaking:** Blueprint ownership
(`automation_blueprints.user_id`) is untouched — the org layer only AGGREGATES
over members' data and gates new `/org` views by role. No existing
ownership/permission check changed.

| Milestone | Status | Notes |
|---|---|---|
| 2.1 Org/department schema | ✅ | `organizations`, `departments`, `org_members`, `org_invitations` (+ Drizzle + migrate). One org per user. `membershipRepository` (create org → seeds department roster from the catalog + owner membership; add/update/remove members). |
| 2.2 Invitations + permissions | ✅ | `invitationRepository` (tokened invite → accept adds membership; TTL 7d; revoke). Roles owner/admin/manager/member in `access.js` (pure policy): **owner/admin = whole org, manager = their department only, member = no org view**. `GET/POST/DELETE /api/org/invitations`, accept route, `PATCH/DELETE /api/org/members` (owner/admin gated). Email delivery is best-effort; the accept link is always returned to share directly. |
| 2.3 Department comparison | ✅ | `departmentComparison` — per-member scores grouped by department (avg adoption, blueprints started/complete, implementations). |
| 2.4 Org opportunity map | ✅ | `orgOpportunityMap` — personal maps rolled up + **deduped by area** ("N people share Lead capture"), grouped by department. `/org/opportunities`. |
| 2.5 Platform usage | ✅ | `platformUsage` — tally of built workflow targets across the org (n8n/make/…). |
| 2.6 Executive reporting | ✅ | `execReport` — the 5-question exec view (where using AI / where not / what's building / what's it costing / is it controlled), pulling 2.3–2.5 + real per-conversation cost + a governance rollup (no-owner / missing-approvals / sensitive-data from `governance_scans`). `/org` dashboard. |

**Key design guarantee:** per-member org scores use the SAME
`buildAdoptionSignals` + `computeAdoptionScore` as the individual dashboard
(extracted to one source of truth), so an org rollup can never disagree with what
a member sees. Verified on real data — a Marketing member's individual score (63)
equals their number in the org rollup.

**Scope decisions:** additive (no ownership changes); one-org-per-user; managers
department-scoped; invite email best-effort (link always returned). Access is
enforced server-side in every org route/page, not just hidden in the UI.

**Honest note on scoring:** an empty member scores **0** (no phantom skills
baseline). Before Phase 3 a fully-engaged member capped at 90; **Phase 3 now
lifts that to 100** by feeding `active_workflows` real confirmations. Reachable
from the app header (profile menu → "Organisation"). Tests: `tests/orgAccess.test.js`,
`tests/orgRepo.test.js`. Verified end-to-end on a real 2-member org.

## Phase 3 — Implementation Tracking — ✅ done

Turns Implemented / Active / Measured from INFERENCE into CONFIRMED fact —
closing the "estimated activity vs. real adoption" credibility gap. Plugs into
Phase 1's progression events.

| Milestone | Status | Notes |
|---|---|---|
| 3.1 Confirm implemented | ✅ | `blueprint_implementations` table + `confirmImplemented` (platform, deployment date, owner). Deploying implies active. |
| 3.2 Active/inactive | ✅ | `setActive` toggle, independent of implemented (a workflow can be turned off later). |
| 3.3 Manual outcome reporting | ✅ | `reportOutcome` (usage volume, hours saved, notes) → sets "Measured". **Explicitly labelled self-reported** in the UI until Phase 4 telemetry. |
| 3.4 Wire into taxonomy + score | ✅ | Confirmations fire the real `implemented` / `active` / `measured` progression events, and the **`active_workflows` score signal now reads confirmed-active implementations** — for both the individual dashboard and the org per-member/department rollup. |

UI: `ImplementationPanel` on the Blueprint report page (`/report/[id]`) — confirm,
toggle active, report outcomes. API: `GET/POST/PATCH/PUT /api/blueprints/[id]/implementation`
(ownership-gated). **Verified on real data:** confirming an implementation raised
a user's score **67 → 77** (exactly the +10 active-workflows weight) and advanced
their furthest stage from "considered" to **"measured"**. Tests:
`tests/implementation.test.js` (confirm→events, active toggle, outcome→measured,
input sanitisation) + the org "active lifts to 100" case.

## Phase 4 — Execution Telemetry — ✅ foundation done (n8n)

Converts Phase 1's ESTIMATES into MEASURED values from real platform runs. The
spec calls this the last, most speculative phase; built as the portable
webhook-ingestion foundation (n8n first).

| Milestone | Status | Notes |
|---|---|---|
| 4.1 Per-platform ingestion | ✅ (n8n) | `telemetry_tokens` + `execution_events` tables. **Token-authenticated** `POST /api/telemetry/ingest` (single event or batch, no session) → `recordExecutionEvent`. Token management API + `/dashboard/telemetry` setup page with an n8n wiring guide (HTTP Request node → ingest URL). Make/Zapier are fast-follows on the **same contract** (an HTTP action) — not separately built. |
| 4.2 Reliability metrics | ✅ | `executionMetrics` / `userExecutionSummary` — success/failure rate, avg duration, per-category error breakdown, human-intervention rate. Rendered on the report page + dashboard. |
| 4.3 Actual vs estimated | ✅ (volume) | **Measured monthly run volume** (extrapolated from the window) is shown next to the Phase-1 estimate; the coverage caveat flips from "estimated" to pointing at measured data. **Honest gap:** true platform *dollar* cost needs each platform's billing API (out of scope) — we surface the real *volume* that drives cost, not a fabricated $. |
| 4.4 Time-saved measurement | ✅ (measured) | **Genuinely telemetry-derived**, not restated self-report: a per-run rate (`minutes_saved_per_run`, entered on the outcome form) × the **measured monthly run volume** = a real hours-saved figure that scales with actual usage. `measuredHoursSavedForUser` / `measuredHoursForBlueprint`. When set, it **supersedes** the Phase-1 estimate (dashboard coverage card + report page both flip estimated→measured); when a rate isn't set yet, the UI says plainly that hours-saved stays self-reported. Verified: 6 min/run × 60 measured runs/mo → 6 h/mo (superseding a self-reported 99h). |

**Privacy (verified):** only a validated status, duration, a COARSE error category
(raw messages categorised then **discarded**), and an intervention flag are
stored — never payloads/PII. A real-ingest smoke with a customer domain in the
raw error confirmed **nothing sensitive reached storage**. Unowned `blueprint_id`s
are dropped to null (no cross-user attribution). Tokens are shown once and only
ever displayed masked (`abcd…wxyz`); revoke matches on the hint.

**Verified end-to-end on real data:** created a token, ingested 10 runs →
70% success / 20% failure / 1.5s avg / 1 intervention / ~10 runs/mo, errors
categorised, no raw leakage. Tests: `tests/telemetry.test.js` (ingestion privacy +
normalisation, reliability aggregation, token masking + hint-revoke).

**Honest scope:** n8n ingestion is built and portable; Make/Zapier reuse the same
endpoint (a documented fast-follow). Actual-dollar platform cost (4.3) needs
per-platform billing APIs and is explicitly NOT faked — measured run *volume* is
provided instead. This is the foundation the spec said to scope once 1–3 are live.

Tests: `tests/adoptionScore.test.js` (score + catalog), `tests/adoptionRepo.test.js`
(events + opportunity map), `tests/signupProfile.test.js` (registration-time
`seedSignupProfile` — fields→seed, partial, no-op, and the **non-fatal claim
proven**: a seeding failure resolves, never throws). Verified end-to-end on a
real user.
