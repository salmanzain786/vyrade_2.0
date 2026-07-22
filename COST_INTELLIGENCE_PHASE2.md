# Cost Intelligence — Phase 2 (Platform Billing Models) ✅

Phase 2 adds the **billing-model layer**: reference data describing *how* each
platform meters usage — execution vs. task vs. credit vs. underlying-service —
and wires it into the Phase 1 engine so per-run quantities are **data-driven**,
not hardcoded.

Still **no dollar prices** here. Billing *models* (how metering works) are
structural; plan tiers and unit prices (the volatile part) come in the next
sub-phase as a table with `last_checked` + admin overrides.

## What shipped

| File | Role |
|------|------|
| `lib/services/cost/platformBillingModels.js` | `PLATFORM_BILLING_MODELS` for n8n / make / zapier / claude(mcp), `getBillingModel()` (with `mcp`→`claude` alias), `unitsPerRun()`. |
| `lib/services/cost/costModel.js` | Refactored: the execution/task/credit line is now derived from the billing model instead of a per-platform `if` ladder. |
| `tests/platformBillingModels.test.js` | 14 tests: data integrity, alias resolution, per-run math, and engine integration. |

## The billing models

| Platform | billing_model | primary_unit | per-run basis | node-level? |
|----------|---------------|--------------|---------------|-------------|
| **n8n** | `workflow_execution` | execution | `per_execution` → **1/run** | no |
| **make** | `credits` | operation¹ | `per_module` → **modules × weight** | no |
| **zapier** | `tasks` | task | `per_billable_action` → **billable action steps** | no |
| **claude** (`mcp`) | `underlying_service` | unknown | `none` (not metered per run) | no |

¹ Make's real metered unit is the **operation**; the spec's "credit" is the same
idea. We use `operation` to match Make's dashboards and the engine's
`BILLING_UNIT`, and record `also_known_as: 'credit'`. This is the one place I
deviated from the spec's literal `primary_unit: "credit"` — for correctness.

Each model also carries the vendor's own **`free_step_types`** /
**`billable_step_types`** (e.g. Zapier: triggers/filters/paths are free) for
transparency and UI copy, plus `default_module_weight` and `self_hostable`.

## How the engine uses it

`costModel.js` no longer knows how any single platform bills. It asks the model:

```js
const model = getBillingModel(platform);            // data, not code
const perRun = unitsPerRun(model, { billableActionSteps, moduleCount });
// quantity_estimate = monthly_runs * perRun
```

So **adding or adjusting a platform's metering is a data edit** in
`platformBillingModels.js` — no engine change. `default_module_weight` is
honoured (a future "AI modules cost 3 operations" tweak is one number), and an
unmetered platform (Claude) simply produces no execution line.

## Verify

```bash
npx vitest run tests/platformBillingModels.test.js   # 14 passing
npx vitest run tests/costModel.test.js               # 20 passing (unchanged behaviour)
```

## Next

- **Phase 2b — Pricing data:** plan tiers + unit prices in a table
  (`tool_pricing`, `platform_pricing_assumptions`) with source URL, `last_checked`,
  confidence, and admin overrides. Only then do `unit_price` / `estimated_total`
  become real numbers.
- **Phase 3 — Surfacing:** API route + Blueprint/export UI panel.
