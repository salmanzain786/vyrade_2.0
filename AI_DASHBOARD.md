Vyrade — AI Adoption Intelligence: Detailed Milestones
Scope: This is a significant new phase, not an incremental feature — it adds a second product layer (AI Adoption Intelligence) on top of the existing Automation Workspace, and for the org-level parts, introduces multi-tenancy (organizations/departments/members) that doesn't exist in the codebase today. Sizing that honestly up front matters more than a tidy total.
Structure: Following the rollout phases already defined in the spec — Phase 1 (Profile + Blueprint Intelligence) is buildable now on existing data. Phase 2 (Organisational Dashboard) is the biggest architectural lift. Phase 3 (Implementation Tracking) is small and high-value. Phase 4 (Execution Telemetry) is real integration work per platform and should wait until 1–3 are validated with real users.
Total estimated effort: ~40–53 working days (8–10.5 weeks) for Phases 1–3, one developer full-time. Phase 4 adds another ~13–18 days and is intentionally sequenced last — see the note at the end on why.

Phase 1 — Profile + Blueprint Intelligence
Why first: Everything here can be built from data Vyrade already generates or can reasonably ask for — no org/multi-tenant model needed yet. This phase alone makes the individual dashboard real.
Estimated time: ~16–21 days
Milestone
Detail
Est. time
1.1 Progressive signup profiling
Extend registration/onboarding: role, job title, department, industry, company size, technical skill level, main responsibilities, current AI tools, current automation platforms, main bottlenecks. Per the spec's own guidance — don't front-load all of this at signup; capture the minimum at registration (role, department, industry) and prompt for the rest contextually on first dashboard visit or first Blueprint. New user_profiles table.
2–3 days
1.2 Personalised opportunity map
Given role/department/tasks, generate an initial list of relevant workflow areas (the Marketing Manager / Finance Manager / Support Manager examples in the spec). Recommend starting with a curated mapping table (role/department → workflow area list), not an LLM call per signup — cheaper, deterministic, and easy to hand-tune early on. Can be upgraded to LLM-personalized later once there's a reason to. New opportunity_map table (per user, per workflow area, with status).
2–3 days
1.3 Progression-stage event tracking
The 9-stage taxonomy (Discovered → Considered → Blueprint started → Blueprint complete → Architecture selected → Implementation prepared → Implemented → Active → Measured) needs real events wired in: a workflow-area view fires "Discovered," a save/compare fires "Considered," Blueprint creation fires "Blueprint started," readiness-gate pass fires "Blueprint complete," platform recommendation accepted fires "Architecture selected," export fires "Implementation prepared." This reuses the same event-logging pattern already built for operational insights (operational_events) rather than inventing a new mechanism.
3–4 days
1.4 Individual AI Adoption Score
Composite score from opportunities explored, Blueprints started/completed, implementations prepared, confirmed-active workflows, breadth of responsibilities covered, governance completion, skills/readiness. Present as a directional index with explanation, not a falsely precise number — per the spec's own explicit caution ("Do not make the score appear scientifically exact"). Needs a documented, adjustable weighting formula (expect to tune this after real usage, so don't hardcode assumptions deep in the UI layer).
3–4 days
1.5 Individual dashboard UI ("Your AI Adaptability")
Current maturity level, opportunity counts (explored/saved/Blueprints by stage), recommended next actions, untapped opportunities list. Mostly presentation over data that milestones 1.1–1.4 already produce.
3–4 days
1.6 Workflow coverage + estimated potential
"4 of 12 opportunities addressed," estimated hours/month reducible, top high-impact gaps. Must be explicitly labeled "estimated" until Phase 4 telemetry exists — the spec is direct about this, and it protects the product's credibility (don't let a soft estimate look like a measured fact).
1–2 days
1.7 Skills & readiness display
Derived from the technical-skill-level field captured in 1.1, cross-referenced against the complexity of platforms/workflows the user has engaged with (e.g., API-based vs. no-code).
1 day

Dependency: None — can start immediately, builds entirely on the existing Blueprint/user model.

Phase 2 — Organisational Dashboard
Why this is the real scope decision: everything in Phase 1 is single-user. Phase 2 requires an actual organization/department/membership model — something the product doesn't have today (Vyrade currently has users and Blueprints, not companies with employees). This is the single biggest architectural addition in this whole roadmap, comparable in scope to the entire Admin/Ops Dashboard milestone already built for the launch gate — worth confirming this is genuinely the next priority before starting, not assuming it from the spec alone.
Estimated time: ~17–23 days
Milestone
Detail
Est. time
2.1 Organization/department schema
New organizations, departments, org_members (linking users to an org + department + role) tables. This is a real multi-tenancy addition, not a small migration — plan for it to touch auth, Blueprint ownership, and permissions checks throughout the app.
4–5 days
2.2 Employee invitations + permissions
Invite-by-email flow, org roles (owner/admin/manager/member), and org-scoped access control so a manager sees their department's data, not another department's.
3–4 days
2.3 Department comparison dashboard
Aggregate individual scores (from 1.4) by department: opportunities, Blueprints by status, active workflows, adoption %.
3–4 days
2.4 Organisation opportunity map
Aggregate personal opportunity maps (1.2) into an org-level view, deduplicating/grouping similar opportunities across employees so leadership sees "38 opportunities in Marketing," not 14 near-duplicate individual lists.
2–3 days
2.5 Platform usage overview (org level)
Aggregate which platforms (n8n/Make/Zapier/Claude Code/custom) are actually chosen across the org's Blueprints — mostly aggregation over data the recommendation engine already produces, no new data collection needed.
1–2 days
2.6 Executive reporting module
The 5-question exec view (where are we using AI / where aren't we / what's being built / what's it costing / is it controlled), pulling together 2.3–2.5 plus cost data (already tracked per-conversation) and a first-pass governance view (workflows without an owner, missing approvals — most of this is derivable from existing Blueprint fields, not new tracking).
4–5 days

Dependency: Hard dependency on 2.1 — nothing else in this phase can start until the org/department model exists.

Phase 3 — Implementation Tracking
Why this is small but high-value: this is what turns "Implemented" and "Active" from assumptions into confirmed facts, closing the credibility gap the spec itself worries about (estimated activity vs. real adoption).
Estimated time: ~7–9 days
Milestone
Detail
Est. time
3.1 "Confirm implemented" flow
A user or admin marks a Blueprint's workflow as actually deployed — captures platform, deployment date, owner.
2 days
3.2 Active/inactive status
A simple status toggle + display, separate from "implemented" (a workflow can be implemented but later turned off).
1 day
3.3 Manual outcome reporting
A lightweight form: estimated usage volume, time saved, free-text notes — explicitly manual/self-reported until Phase 4 telemetry replaces it.
2 days
3.4 Wire into the progression taxonomy + adoption score
"Implemented," "Active," and "Measured" stages (from 1.3) now advance based on real confirmations from 3.1–3.3, not inference.
2 days

Dependency: Needs Phase 1's progression-stage tracking (1.3) to plug into.

Phase 4 — Execution Telemetry (deliberately last)
Why this should wait: this is real, per-platform integration work (n8n, Make, Zapier each have different APIs/webhooks for execution data), and it's the most speculative phase — it only pays off once Phases 1–3 prove people are actually using the adoption dashboard. Building telemetry integrations before that risks real engineering time on a layer nobody's asked to see yet.
Estimated time: ~13–18 days (not detailed line-by-line here, since the concrete plan should be scoped once Phases 1–3 are live and it's clear which platform's telemetry matters most)
Milestone
Detail
Est. time
4.1 Per-platform execution data integration
Webhook/API integration per platform (n8n first, since it's already the most integrated — Make/Zapier as fast-follows).
5–7 days
4.2 Success/failure rates, execution time, API errors, human interventions
Built on top of 4.1's raw data.
3–4 days
4.3 Actual vs. estimated platform cost
Replace/augment the estimated cost figures from Phase 1 with real numbers once available.
2–3 days
4.4 Time-saved / business-outcome measurement
The final step — connects execution telemetry back to the "hours/month reducible" estimate from 1.6, converting it from an estimate to a measured value.
3–4 days

Recommendation: don't schedule this yet. Revisit sizing once Phase 3 has real usage data to justify the investment.

Summary Timeline
Phase
What it delivers
Est. time
Depends on
1 — Profile + Blueprint Intelligence
Individual adoption dashboard, real
16–21 days
Nothing — start now
2 — Organisational Dashboard
Department + executive views
17–23 days
Org/department schema (2.1) — the big scope item
3 — Implementation Tracking
Real confirmation of deployed/active workflows
7–9 days
Phase 1's progression tracking
4 — Execution Telemetry
Real (not estimated) performance/cost data
13–18 days
Phases 1–3 live and validated; deliberately deferred
Total (Phases 1–3)


~40–53 days (8–10.5 weeks)


Total (all 4 phases)


~53–71 days (10.5–14 weeks)




Open questions worth settling before Salman starts
Is the org/department model (Phase 2) actually in scope soon, or is this initially an individual-user product? This is the single biggest fork in the roadmap — Phase 1 alone is a strong, shippable product on its own (an individual adoption dashboard), and Phase 2 is a genuine multi-tenancy build comparable in size to everything else in this launch gate combined. Worth deciding explicitly rather than assuming both phases happen back-to-back.
Curated opportunity-map table vs. LLM-personalized (1.2): recommend starting curated (cheaper, deterministic, easy to hand-tune) and revisiting once there's real signal on which roles/industries actually sign up.
Adoption score formula (1.4): needs a first version everyone's comfortable with, and an explicit expectation that it'll be retuned after real usage — worth writing down the initial weights as a documented, changeable config rather than embedding assumptions in code.
Governance/risk module depth (2.6): the spec lists workflows without owners, sensitive-data usage, missing approvals, outdated outputs, unreviewed tools, duplicate platforms. Most of these are derivable from existing Blueprint fields with light additions — but "sensitive data usage" and "unreviewed tools" likely need new fields/flags that don't exist yet. Worth scoping this list down for a first version rather than building all of it at once.
