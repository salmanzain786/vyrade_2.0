Vyrade — Work Intelligence (Task-to-Automation): Detailed Milestones
Scope: This is a major new capability — task-management platform connectors, employee-initiated and org-wide automation opportunity discovery, task-to-Blueprint conversion, and progress sync back to the task platform. Per the spec's own guidance, this should ship as a connected capability under Integrations ("Work Intelligence"), not a standalone core feature — and should start narrow (one platform, employee-initiated only) before expanding, matching the spec's explicit "Detect → suggest → confirm → clarify → Blueprint" starting point rather than the later auto-create mode.
Reuse note (important for sizing): Vyrade already has real infrastructure this feature should build on rather than duplicate — an opportunity_map table and org-wide opportunity aggregation (from AI Adoption Intelligence), a real cost-estimation engine, the governance/compliance scanner (Automation Assurance), an admin dashboard framework, and existing secret/PII redaction utilities. Several milestones below are sized smaller than they'd otherwise be because they extend existing systems instead of building from scratch — flagged explicitly where relevant.
Total estimated effort: ~67–87 working days (13.5–17.5 weeks) for Phases 1–5 (the full single-platform product), one developer full-time. Phase 6 (additional platforms) and Phase 7 (auto-create mode) are intentionally sequenced last — see the notes at the end.

Phase 1 — Foundation: Connection Setup & Governance
Why first, and why it's the real scope decision: the spec is explicit and repeated about this: "Vyrade should not automatically read the entire workspace without clear authorisation" and "avoid positioning this as employee surveillance." Getting consent, scope, and retention right isn't a nice-to-have wrapped around the feature — it's the prerequisite that makes the rest of this defensible to build at all. This phase is comparable in importance to how the Blueprint policy schema was the prerequisite for the whole governance-comparison phase earlier.
Estimated time: ~14–18 days
Milestone
Detail
Est. time
1.1 OAuth connector framework
A pluggable, per-platform OAuth flow (not hardcoded to one vendor) — token storage, refresh, revocation. Built once, reused by every platform in Phase 6.
3–4 days
1.2 Pilot platform integration — task retrieval
Recommend ClickUp as the pilot (the spec's own detailed example uses it, and its API is well-documented). Real task/subtask/checklist/comment/attachment/status-history retrieval, mapped into a normalized internal task model.
4–5 days
1.3 Connection setup UX
The scope-selection screen the spec describes in detail: workspaces, projects, teams, boards, data fields, read permissions, write-back permissions (separate toggle — see 4.1), employees/departments included, historical range, excluded projects, sensitive-data rules. This is a real, multi-step settings UI, not a single OAuth button.
3–4 days
1.4 Governance & consent framework
Retention policy for ingested task content (how long it's kept), who can see identified opportunities, and an employee notification/consent mechanism — the spec explicitly asks for a way to avoid this feeling like surveillance.
2–3 days
1.5 Sensitive-data handling on ingest
Apply Vyrade's existing redaction/sanitization utilities (already built for the governance scanner and analytics layers) to task content before it's stored — reused, not reinvented.
2 days

Dependency: None — foundational, must complete before anything else in this feature.

Phase 2 — Employee-Initiated Automation Discovery
Why this is the core loop: this is Mode 1 from the spec — a single employee selects one task and gets a real Blueprint, not a generic one-shot LLM prompt. This is the smallest complete version of the product and should be validated with real users before Phase 3's org-wide analysis is built.
Estimated time: ~13–16 days
Milestone
Detail
Est. time
2.1 "Explore Automation With Vyrade" entry point
The action an employee triggers from a selected task — either a Vyrade-side task browser/picker, or (stronger, matches the spec's UX intent) a deep-link/webhook so it can be triggered from inside the task platform itself.
2 days
2.2 Context retrieval & normalization
Pull the full authorized context per the spec's list — name, description, assignee, department/project, subtasks, checklist, comments, attachments/linked docs, recurrence, due dates, labels, related tasks, status history — into the normalized model from 1.2.
3–4 days
2.3 Process-discovery clarification engine
The heart of the "why not use the task directly as a prompt" argument — an LLM-driven step that asks the specific, focused questions the spec illustrates (data sources, KPIs, format, reviewer, delivery timing, error handling, AI-narrative use, storage system, approval) rather than guessing.
4–5 days
2.4 Draft Blueprint generation from task + answers
Extracts objective, trigger, inputs, process steps, systems, business rules, approvals, exceptions, outputs — reuses Vyrade's existing Blueprint-generation engine with a new input source (task + clarification answers) rather than a parallel generator. Anything still uncertain is explicitly marked for clarification, not silently guessed.
3–4 days
2.5 Architecture + cost evaluation wiring
Once a draft Blueprint exists, Vyrade's existing platform-recommendation and cost-intelligence engines run unchanged — this milestone is the wiring, not new logic.
1 day

Dependency: Needs Phase 1 (real task access + normalized model).

Phase 3 — Organisation-wide Opportunity Discovery
Why this is bigger and riskier than Phase 2: this is genuine pattern-detection work across potentially large volumes of task metadata (Mode 2 from the spec) — recurring names, repeated subtasks, high-volume handoffs, tasks copied across projects, long durations, repeated status changes, consistent checklist structures, common tool usage, approval bottlenecks, reopened tasks. This is meaningfully harder than Phase 2's single-task extraction.
Estimated time: ~12–15 days
Milestone
Detail
Est. time
3.1 Recurring-work pattern detection engine
Analyze authorized task metadata for the 11 signal types the spec lists. Start with the cheaper, rules-based signals (recurring-task flags, repeated names/checklists, duration outliers) before anything requiring more sophisticated clustering — same "start deterministic, upgrade later" philosophy used for the curated opportunity catalog elsewhere in Vyrade.
5–6 days
3.2 Automation Opportunity Map (org-level)
Groups findings into named opportunities (the spec's own examples: "Monthly reporting across 14 client projects," "Lead-data cleanup repeated by six sales employees"). Reuse note: this should extend the opportunity_map table and aggregation logic already built for AI Adoption Intelligence rather than building a parallel system — real cost savings here.
3–4 days
3.3 Manager opportunity review flow
Per the spec's explicit caution — these are not automatically approved automations. A manager or employee must confirm an opportunity before it becomes a Blueprint.
2–3 days
3.4 "Analyse a project" / "Analyse recurring work" modes
The two additional opportunity modes beyond single-task analysis, as distinct entry points in the UI.
2 days

Dependency: Needs Phase 1 (data access) and benefits from Phase 2's context/clarification patterns. Also benefits from — but doesn't strictly require — the org/department model already built for AI Adoption Intelligence, since manager-scoped review naturally maps onto it.

Phase 4 — Automation Project Synchronisation (write-back)
Estimated time: ~7–9 days
Milestone
Detail
Est. time
4.1 Write-back permission handling
A distinct, separately-consented permission from read access (per the spec's governance list) — an org can allow Vyrade to read tasks without allowing it to write back.
1–2 days
4.2 Progress sync
Creates/updates a task-platform project reflecting Blueprint lifecycle stages — the spec's own list (clarification required → requirements complete → architecture review → cost model ready → implementation package generated → security assessment required → testing → deployment approval pending → workflow active → outcome review due).
4–5 days
4.3 Bi-directional linking
The originating task stores a link to its Blueprint, and the Blueprint stores a link back — surfaced on both sides.
2 days

Dependency: Needs Phase 2 (a Blueprint originating from a task) and Vyrade's existing Blueprint lifecycle/status fields (already present).

Phase 5 — Deeper Feature Integration
Why this matters: this is what makes the feature genuinely woven into Vyrade rather than a bolt-on — the spec is explicit that task data should improve several existing features, not just produce Blueprints in isolation.
Estimated time: ~9–13 days
Milestone
Detail
Est. time
5.1 Cost Intelligence enrichment
Feed frequency, assignees, estimated time, recurrence, related-task count, average delay, and manual-review steps into the existing cost engine — clearly labeled as estimates until confirmed, consistent with how every other estimate in Vyrade is already labeled.
2–3 days
5.2 Contextual Workflow Intelligence enrichment
Task data improves the existing retrieval layer (what employees actually do, which systems appear together, where blockers occur) — this touches live retrieval logic, so it needs care and real evaluation, not just a data dump.
3–4 days
5.3 Automation Assurance (governance scanner) linkage
An existing workflow tied to a task/project can be uploaded and assessed using the already-built 8-phase compliance scanner — this milestone is a new entry point into that system, not new scanning logic.
1–2 days
5.4 AI Operations Dashboard funnel view
The full funnel the spec describes (tasks analysed → opportunities identified → accepted → Blueprints started → approved → implementations prepared → deployed → outcomes measured) — reuses the admin dashboard patterns and adoption-stage taxonomy already built.
3–4 days

Dependency: Needs Phases 2–4 producing real data to enrich these existing features with.

Summary Timeline — Phases 1–5 (the complete single-platform product)
Phase
What it delivers
Est. time
1 — Foundation: connection & governance
The prerequisite — consent, scope, retention
14–18 days
2 — Employee-initiated discovery
The core loop: one task → real Blueprint
13–16 days
3 — Org-wide opportunity discovery
Pattern detection → Opportunity Map → manager review
12–15 days
4 — Project synchronisation
Write-back, progress sync
7–9 days
5 — Deeper feature integration
Cost, retrieval, Automation Assurance, dashboard funnel
9–13 days
Total (Phases 1–5, one platform)


~67–87 days (13.5–17.5 weeks)


Phase 6 — Multi-Platform Expansion (deliberately sequenced after validation)
Why this should wait: the spec's own recommended platform list is five (Asana, ClickUp, Monday, Jira, Trello) — building all five before Phase 2/3 prove the core loop works risks real engineering time on integrations nobody's used yet. ClickUp (Phase 1's pilot) should prove the pattern first.
Estimated time: ~3–4 days per additional platform (Asana, Monday, Jira, Trello), following the exact connector pattern established in 1.1/1.2 — ~12–16 days total if all four are built, but recommend prioritizing based on actual customer/prospect demand rather than building all four upfront.

Phase 7 — Auto-Create Draft Blueprint (deliberately deferred, not sized)
The spec is explicit about this being a later capability, gated behind explicit organisation opt-in: "Start with: Detect → suggest → confirm → clarify → Blueprint. Later, you may support: Detect → auto-create draft Blueprint. But only under explicit organisation rules." Not sized here — this should be scoped once Phases 1–5 are live and there's real signal on whether organizations actually want this, and what specific opt-in rules they'd want to set.

Non-engineering task (worth noting, not sized as dev work)
The spec recommends an integration-category landing page (/integrations/task-management/) plus individual platform pages (/integrations/clickup/, etc.) — this is content/marketing work, not engineering, and should be scoped separately (similar to how legal-page drafting was budgeted as external/parallel work in the launch-gate plan, not developer time).

Open questions worth settling before Salman starts
Which platform to pilot first? Recommend ClickUp, since the spec's own worked examples use it — but confirm this matches where your actual target customers' work already lives.
How much of Phase 3's pattern detection should be rules-based vs. more sophisticated clustering at v1? Recommend starting rules-based (cheaper, deterministic, explainable — "this task name appeared 14 times" is easy to trust; a similarity-clustering model is harder to explain and debug early on).
Does Phase 3's Opportunity Map genuinely reuse the existing opportunity_map table from AI Adoption Intelligence, or does it need its own schema? This is a real design decision worth making explicitly — reuse is cheaper and keeps one unified "opportunities" concept across the product, but only works cleanly if the existing table's shape accommodates task-sourced opportunities alongside the role/department-sourced ones it has today.
Retention period defaults (1.4): the spec asks the product to define this but doesn't set a number — worth deciding a default (e.g., 90 days) before Phase 1 ships, not after.
Consent mechanism specifics: does an employee need to affirmatively opt in before their tasks are analyzed even for org-wide discovery (Phase 3), or is manager/org-level authorization sufficient with notification-only for employees? This has real trust implications and is worth a deliberate answer, not a default.

