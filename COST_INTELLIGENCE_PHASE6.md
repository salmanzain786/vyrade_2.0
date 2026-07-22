# Cost Intelligence — Phase 6 (Cost Estimate Output) ✅

Phase 6 is where every layer meets. `buildCostEstimate()` takes the structural
cost model (taxonomy + billing model + step mapper, Phases 1–3) and applies real
prices — platform prices from `pricing_sources` (Phase 4) and per-tool prices
from `connector_cost_profiles` (Phase 5) — to emit one structured estimate.

## What shipped

| File | Role |
|------|------|
| `lib/services/cost/costEstimate.js` | `buildCostEstimate()` — composes the model + price resolvers into the Phase-6 output. |
| `tests/costEstimate.test.js` | 5 tests: the spec example (nothing priced), a fully-priced total, and platform variance. |

## Output shape

```jsonc
{
  "blueprint_id": "bp_123",
  "blueprint_version": 5,
  "platform": "zapier",
  "platform_name": "Zapier",
  "monthly_volume": 500,
  "estimated_units": { "task": 1000 },
  "cost_components": [
    { "name": "Zapier task usage", "category": "execution_task_credit",
      "quantity": 1000, "unit": "task", "price": null, "line_cost": null,
      "confidence": "low",
      "reason": "Zapier bills successful action steps as tasks… plan price depends on selected plan." },
    { "name": "Google Sheets", "quantity": 500, "unit": "api_call",
      "price": null, "line_cost": null, "confidence": "unknown",
      "reason": "No explicit API price configured." },
    { "name": "Slack", "quantity": 500, "unit": "api_call",
      "price": null, "line_cost": 0, "confidence": "medium",
      "reason": "API adds no per-use cost on the current plan…" }
    // …platform subscription, hosting, storage, etc.
  ],
  "unknowns": ["Selected Zapier plan", "Exact branch probability", …],
  "currency": "USD",
  "estimated_subtotal": 28.8,   // sum of KNOWN line costs (incl. real $0s)
  "estimated_total": null,      // number only once every CORE line is priced
  "total_is_partial": false,
  "confidence": "low"
}
```

## How prices are applied

- **Platform lines** (subscription, task/operation/execution usage, self-host
  hosting) → `resolvePricing(platform, component_type)` from the Phase-4 registry.
- **External tools** → `estimateConnectorCost(system, { monthlyUnits })` from the
  Phase-5 profiles; the per-call volume comes from the Phase-3 external-call map.
- **LLM / MCP / storage / human** → kept explicit and honest (usually `null` with
  a reason) — never invented.

Price lookups are **injectable** (`resolvers`), so the builder runs fully pure in
tests and DB-backed in production.

## Two honesty rules in the totals

1. **`price: null` never lowers a line's confidence.** A metered line can be
   `price: null, confidence: 'medium'` — we're confident in the *quantity*; the
   missing plan price is surfaced in `unknowns`, not disguised as low confidence.
2. **The headline `estimated_total` appears only when every CORE line is priced**
   (platform + tools + hosting). Soft/variable costs (LLM, storage, human) don't
   block it, but a single unknown *core* cost keeps it `null` while still showing
   the known `estimated_subtotal`.

Verified live end-to-end: with Zapier task price seeded ($0.0288) but Shopify's
store-plan cost unknown, the estimate returned **subtotal $28.80, total null,
`unknowns: ["Shopify pricing", …]`** — the known cost shown, the gap named, no
guess made.

## Verify

```bash
npx vitest run tests/costEstimate.test.js   # 5 passing
```

## The engine is complete

Phases 1–6 are the full cost pipeline:

```
Blueprint
  → taxonomy (P1)  → billing models (P2)  → step→unit mapper (P3)   [quantities]
  → pricing sources (P4)  → connector profiles (P5)                 [prices]
  → buildCostEstimate (P6)                                          [the estimate]
```

Remaining work is **not** engine logic:
- **Seed pricing data** — populate `pricing_sources` / `connector_cost_profiles`
  for the common platforms & tools (admin screen or a vetted scraper).
- **Surface it** — an API route (`GET /api/blueprints/[id]/cost?platform=…`) +
  a Blueprint/export UI panel showing the breakdown and a cross-platform compare.
