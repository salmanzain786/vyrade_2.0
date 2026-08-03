# Admin / Ops Dashboard — Scope & Wireframe (Milestone 3.1)

Operational-visibility layer for `/admin/**`. This doc **confirms the exact
views and that each has real data behind it** (verified against the live
`vyrade_blueprint` schema) before any building starts. It also flags the data
gaps that must be closed for a view to be non-empty.

Status: **3.1 complete** (scope + wireframe + data-readiness verified).

---

## Route map + navigation

| Route | View | Milestone |
|---|---|---|
| `/admin` | Overview (summary tiles + links) | 3.3–3.6 roll-up |
| `/admin/blueprints` | Blueprints overview | 3.3 |
| `/admin/failures` | Failures + import-check | 3.4 |
| `/admin/cost` | Cost + usage + rate-limit blocks | 3.5 |
| `/admin/insights` | Operational insights | 3.6 |

All routes gated to admins only (3.2).

---

## Data-readiness matrix (the core 3.1 finding)

| View / metric | Backing data (verified) | Ready? |
|---|---|---|
| Blueprints list: status | `automation_blueprints.status` (`collecting_requirements`/`blocked`/`requirements_complete`) | ✅ |
| Blueprints: version, activity | `automation_blueprints.current_version`, `updated_at` | ✅ |
| Blueprints: readiness score | `automation_blueprint_versions.readiness_json` (parse) | ✅ (JSON) |
| Blueprints: name | inside `blueprint_json.name` (no dedicated column) | ⚠️ extract from JSON |
| Import failures (verdict) | `blueprint_workflows.workflow_json → $.meta.import_check` (`verified`/`skipped`/`failed`) | ✅ (JSON) |
| Import failures (why) | `operational_events` `import_failed` (16 rows) → `node_type`, `error_category` | ✅ |
| Repairs | `operational_events` `repair_performed` (12) | ✅ |
| Failed **generations** (whole-run) | — no `generation_failed` event emitted today | ❌ **gap** (see below) |
| Per-user cost / tokens | `conversations.total_cost_usd`/`total_tokens`, `conversation_messages.cost_usd` | ✅ |
| Cost trend over time | `conversation_messages.created_at` + `cost_usd` (aggregate) | ✅ |
| Recommendation overrides | `export_runs.is_recommendation_override`, `override_reason` | ✅ (0 rows yet) |
| Rate-limit blocks | `auth_attempts.outcome = 'blocked'` (the schema already defines `success`/`failure`/`blocked`) | ✅ (0 `blocked` rows yet — no one's been limited) |
| Top failing nodes | `operationalInsightsRepository.topFailingNodes()` ← `import_failed` | ✅ |
| Doc gaps | `operationalInsightsRepository.docGaps()` ← `doc_gap` events — **none emitted yet** | ❌ **gap** |

### Gaps to close (flagged, not assumed)

1. **`users` has no `is_admin`/role column** → milestone 3.2 must add it (migration). No admin gate is possible until then.
2. **`generation_failed` is never recorded** — the n8n specialist emits `import_failed`/`workflow_generated`/`repair_performed`/`import_skipped`, but a *whole-generation* failure (LLM/structural give-up) isn't logged. The Failures page can still show import failures + repair pressure; to show true "failed generations" we add one `recordEvent('generation_failed')` at the throw site (small code add).
3. **`doc_gap` events are never emitted** — `docGaps()` exists but returns empty until we record a `doc_gap` when a tool/system has no usable retrieval docs (small code add in the specialist/retrieval path). The Insights page's "missing docs" panel is empty until then.
4. ~~Rate-limit outcome~~ **RESOLVED** — `auth_attempts.outcome` already defines
   `blocked`, so the limiter's blocks are queryable directly (`WHERE outcome =
   'blocked'`). Just 0 such rows so far (no one's been limited yet).
5. **Data is sparse now** (test rows). Views are correct but thin until real usage — 3.8 seeds known-bad rows to prove each view.

**Progress:** ALL data gaps closed. #1 (3.2 — `users.is_admin` + `/admin` gate),
#2 (3.4 — `generation_failed` recorded), #3 (3.6 — `doc_gap` emitted at
generation time for systems with no tool docs), #4 was a non-issue
(`outcome='blocked'` already exists). Views built: 3.3 Blueprints, 3.4 Failures,
3.5 Cost, 3.6 Insights, 3.7 (pagination in every view + CSV export on
Blueprints/Failures/Cost via `/api/admin/*/export`), 3.8 (QA pass —
`npm run qa:admin` seeds known-bad rows, verifies all 4 views + override,
cleans up; 12/12 green). **All milestones 3.1–3.8 complete.**

---

## Wireframes

### `/admin` — Overview
```
┌─ Vyrade Admin ───────────────────────────── [Blueprints][Failures][Cost][Insights] ─┐
│                                                                                      │
│  ┌── Blueprints ──┐ ┌── Import fails ─┐ ┌── Spend (7d) ──┐ ┌── Override rate ─┐      │
│  │  15 total      │ │  16 recent      │ │  $ 12.40       │ │  0 / 0 exports   │      │
│  │  5 complete    │ │  4 nodes hot    │ │  ▁▂▅▃▇▂▁ trend │ │                  │      │
│  └────────────────┘ └─────────────────┘ └────────────────┘ └──────────────────┘      │
│                                                                                      │
│  Recent activity ─────────────────────────────────────────────────────────────      │
│  • bp_… requirements_complete   user@…   v3   2h ago                                 │
│  • import_failed  httpRequest   auth      1d ago                                     │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

### `/admin/blueprints` — 3.3
```
┌ Blueprints ──────────────────────────────────────────────────────────────────────┐
│ Search [__________]  Status[ all ▾]  User[ all ▾]  Readiness[ any ▾]   [CSV ⤓]     │
│ ┌──────────────────────────────────────────────────────────────────────────────┐  │
│ │ Name           User        Status               Readiness  Ver  Last activity │  │
│ │ Payroll sync   a@b.com      requirements_complete  92%      v3   2h ago        │  │
│ │ Lead router    c@d.com      collecting_requirem…   40%      v1   1d ago        │  │
│ │ (blocked)      e@f.com      blocked                 —       v2   3d ago  ⚠     │  │
│ └──────────────────────────────────────────────────────────────────────────────┘  │
│                                              ‹ 1 2 3 … ›   showing 1–50 of 15       │
└────────────────────────────────────────────────────────────────────────────────────┘
```

### `/admin/failures` — 3.4
```
┌ Failures & import checks ─────────────────────────────────────────────────────────┐
│ Tab: [ Import checks ] [ Failing nodes ] [ Repairs ]        Range[30d ▾] [CSV ⤓]   │
│ ┌ Import verdicts ───────────────┐  ┌ Top failing nodes (import_failed) ────────┐  │
│ │ verified   4                   │  │ httpRequest      5  ▇▇▇▇▇                   │  │
│ │ skipped    1                   │  │ set              3  ▇▇▇                     │  │
│ │ failed     0   (per workflow)  │  │ code             2  ▇▇                      │  │
│ └────────────────────────────────┘  └────────────────────────────────────────────┘  │
│ Blueprint          Platform  import_check  error_category  node        When         │
│ Payroll sync v3    n8n       verified      —               —           2h           │
│ Lead router v1     n8n       failed        auth            httpRequest 1d  ⚠         │
└────────────────────────────────────────────────────────────────────────────────────┘
```

### `/admin/cost` — 3.5
```
┌ Cost & usage ─────────────────────────────────────────────────────────────────────┐
│ Range[30d ▾]                                                          [CSV ⤓]       │
│  Spend trend  ▁▂▃▅▂▇▃▁▂  $12.40 total / 30d                                         │
│ ┌ Per-user spend ───────────────────────────────┐ ┌ Rate-limit blocks ──────────┐  │
│ │ User        Tokens     Cost     Convos  Spike? │ │ IP / email    Fails  Blocked│  │
│ │ a@b.com     412k       $6.20    8       ⚠      │ │ 1.2.3.4       9      —*     │  │
│ │ c@d.com     190k       $3.10    5              │ │ *derive/limiter outcome     │  │
│ └────────────────────────────────────────────────┘ └─────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────────────┘
```

### `/admin/insights` — 3.6
```
┌ Operational insights ─────────────────────────────────────────────────────────────┐
│ Range[30d ▾]                                                                        │
│ ┌ Top failing nodes ─────────────┐ ┌ Doc gaps (tools missing docs) ──────────────┐ │
│ │ httpRequest   5                │ │ (empty until doc_gap events are emitted)     │ │
│ │ set           3                │ │  → gap #3                                     │ │
│ └────────────────────────────────┘ └──────────────────────────────────────────────┘ │
│ ┌ Import outcomes ───────────────┐ ┌ Repair stats ───────────────────────────────┐ │
│ │ generated 16  failed 16  skip 4│ │ repairs 12   avg attempts 1.3                │ │
│ └────────────────────────────────┘ └──────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Cross-cutting (later milestones, scoped here)

- **3.2 Auth gate:** add `users.is_admin TINYINT(1) DEFAULT 0`; a `requireAdmin`
  guard (extends `withAuth`) → 403 for non-admins; `/admin/**` layout checks it
  server-side.
- **3.7 Pagination / filters / CSV:** every table paginated (default 50), the
  filters shown in each wireframe, and a `[CSV ⤓]` export per view.
- **3.8 QA seed:** a seed script inserting known-bad rows — a `failed`
  import_check workflow, a `blocked` user (rate-limit), a cost-spike user, a
  recommendation override — to prove each view surfaces them.

## Decisions this milestone surfaces (for sign-off)

1. **Admin identity:** flag column `users.is_admin` (simplest) vs a full `role`
   enum. *Recommend `is_admin` now* — role can come later.
2. **Close gaps #2/#3?** Emit `generation_failed` + `doc_gap` events so the
   Failures and Insights views are fully populated — small code adds, recommended
   as part of 3.4/3.6. Otherwise those panels stay partial.
3. **Rate-limit source (gap #4):** distinct `outcome` from the limiter vs derived
   from failure clustering — decide in 3.5.
