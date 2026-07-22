# Cost Intelligence — Phase 3 (Step → Cost-Unit Mapper) ✅

Phase 3 maps a Blueprint's process steps into **platform-metered units**,
correctly and per-platform, because the same workflow bills very differently on
each. It replaces Phase 2's coarse per-run count with a real per-step model that
understands free triggers, module weights, branch probabilities, and
executions-per-event — and derives the external-call breakdown.

Still **no dollar prices** — this is about *how many units*, not *how many
dollars*.

## What shipped

| File | Role |
|------|------|
| `lib/services/cost/stepMapper.js` | `STEP_COST_PROFILE` (per `action_type` cost semantics) + `mapStepsToCostUnits()` — the per-platform step→unit engine. |
| `lib/services/cost/costModel.js` | Refactored: the metered line, external-tool quantities, LLM count, and confidence all now come from the mapper. Adds `metering` (per-step drill-down) and `external_calls` to the output. |
| `tests/stepMapper.test.js` | 12 tests reproducing the task's n8n / Make / Zapier / MCP examples. |

## The mappers

**n8n** — `executions = monthly_events × workflow_runs_per_event`
Node count is complexity, **not** platform cost. 20 nodes or 2, it's still one
execution per run.

**Zapier** — `tasks = monthly_runs × Σ(successful_action × branch_probability)`
Triggers, filters and paths are **free**. Task spec example reproduced in tests:
500 orders, trigger + filter free, 2 actions → **1,000 tasks/month**.

**Make** — `operations = monthly_runs × Σ(module_weight × branch × bundle_multiplier)`
Normal module = 1, router/filter ≈ 0, **AI module = 3 (variable, low confidence)**,
bundle multiplier for iterators returning many items.

**MCP / Claude** — **not metered per run**. Returns zero platform units; cost is
hosting + underlying API + LLM + connector maintenance. Never fabricates an MCP
"seat" price.

## Per-`action_type` cost profile

`STEP_COST_PROFILE` is the single source of step semantics — each
`action_type` declares whether it's a billable Zapier task, its Make operation
weight, whether it makes an external call, and whether it's an AI step:

| action_type | Zapier billable | Make weight | external call | AI |
|-------------|:--:|:--:|:--:|:--:|
| receive_data (trigger) | ✗ | 1 | ✓ | |
| validate_data (filter) | ✗ | 0 | | |
| business_decision (router) | ✗ | 0 | | |
| retrieve_data / write_data / notification | ✓ | 1 | ✓ | |
| ai_reasoning / generate_content | ✓ | 3¹ | ✓ | ✓ |
| human_approval / wait | ✗ | 0 | | |

¹ variable → lowers the estimate's confidence and says so.

## What the engine now emits

`deriveCostModel()` gains two fields:

```js
metering: {
  primary_unit: 'task',
  units_per_run: 3,
  monthly_units: 15000,
  per_step: [ { step_id, action_type, kind, unit_contribution_per_run, billable, branch_probability, external_call, is_ai }, … ]
},
external_calls: [ { step_id, label, calls_per_run, monthly_calls }, … ]
```

Live example (5,000 leads/month, 4 steps: receive → validate → write → notify):

| Platform | Metered | Why |
|----------|---------|-----|
| **n8n** | 5,000 executions | 1 per run; node count irrelevant |
| **Zapier** | 15,000 tasks | 3 billable actions (trigger free) |
| **Make** | 20,000 operations | 4 modules (trigger counts) |

…plus 5,000 external calls/month per external step.

## New knobs

`deriveCostModel({ …, runsPerEvent, bundleMultiplier })` and
`mapStepsToCostUnits({ …, branchProbabilities })` let a caller refine estimates
as more is known (n8n fan-out, Make iterators, conditional branch rates).

## Verify

```bash
npx vitest run tests/stepMapper.test.js    # 12 passing
npx vitest run tests/costModel.test.js tests/platformBillingModels.test.js  # 34 passing
```

## Next

- **Pricing data:** plan tiers + unit prices (`tool_pricing`,
  `platform_pricing_assumptions`) with source URL, `last_checked`, admin
  overrides → then `unit_price` × `quantity_estimate` becomes a real
  `estimated_total`.
- **Surfacing:** API route + Blueprint/export UI panel with the per-step drill-down.
