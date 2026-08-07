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

**Honest note on scoring:** a fully-engaged member caps at **90**, not 100 —
`active_workflows` (weight 0.10) stays 0 until **Phase 3** confirms deployment.
An empty member scores **0** (no phantom skills baseline). Reachable from the app
header (profile menu → "Organisation"). Tests: `tests/orgAccess.test.js`,
`tests/orgRepo.test.js` (access policy, per-member scoring, dept/opportunity/
platform aggregation, invitation guards). Verified end-to-end on a real 2-member org.

Tests: `tests/adoptionScore.test.js` (score + catalog), `tests/adoptionRepo.test.js`
(events + opportunity map), `tests/signupProfile.test.js` (registration-time
`seedSignupProfile` — fields→seed, partial, no-op, and the **non-fatal claim
proven**: a seeding failure resolves, never throws). Verified end-to-end on a
real user.
