# Cost Intelligence — Phase 5 (Tool / API Pricing Profiles) ✅

Phase 5 adds `connector_cost_profiles` — per-tool pricing for the external
systems a workflow touches (the **External API / tool cost** category). It's the
sibling of Phase 4: Phase 4 tracks *where a price came from* (provenance); Phase 5
holds the *tool's pricing shape* (model, unit, included allowance, overage), with
the same honesty contract.

## What shipped

| File | Role |
|------|------|
| `sql/connector_pricing.sql` | `connector_cost_profiles` table (in `migrate.js`, applied ✓). |
| `lib/db/schema.js` | Drizzle mirror (`connectorCostProfiles`). |
| `lib/services/cost/connectorProfiles.js` | **Pure** governance + `estimateConnectorMonthlyCost()`. |
| `lib/services/cost/connectorProfileRepository.js` | `getConnectorProfile`, `resolveConnector`, `estimateConnectorCost`, `upsertConnectorProfile`, `listConnectorProfiles`. |
| `tests/connectorProfiles.test.js` | 15 tests (pure + mocked pool; both spec examples). |

## The table

```
connector_cost_profiles
  id, connector_id, connector_name, platform, system_name,
  pricing_model, pricing_url, free_tier_available, requires_paid_plan,
  unit_name, unit_price, included_units, overage_price,
  rate_limit_notes, confidence, notes, last_checked_at, …
  UNIQUE (connector_name, platform)   INDEX (system_name)
```

`pricing_model` ∈ `per_api_call` · `workspace_plan` · `subscription` ·
`per_seat` · `tiered` · `usage_based` · `free` · `unknown`.

## Three honest outcomes (verified live)

The estimator distinguishes **"free"** from **"unknown"** — a distinction that
matters a lot for a cost tool:

| Connector | Profile | Result |
|-----------|---------|--------|
| **Email Validation API** | `per_api_call`, no unit_price ("provider not selected yet") | `cost: null`, **unknown** — *no guess* |
| **Slack** | `workspace_plan`, `requires_paid_plan: false` | `cost: 0`, **medium** — a *real* $0, "API adds no per-use cost; plan limits apply" |
| **HubSpot** | `subscription`, `unit_price 0.006`, `included 1000`, official URL, 5,000 units | `cost: 24`, **high** — (5000−1000)×0.006 |

## Governance (same spine as Phase 4)

`governConfidence()` never claims more than the data supports:
- an **unpriced** usage connector is **`unknown`**, no matter what it claims;
- a **`high`** claim **without a `pricing_url`** is demoted to `medium`;
- a genuine no-added-cost tool (`free`, or `workspace_plan` + `requires_paid_plan: false`) keeps its stated confidence and returns a real `$0`.

## Estimator

```js
estimateConnectorMonthlyCost(profile, { monthlyUnits })
// usage-based: bill only beyond the included allowance
//   billable = max(0, monthlyUnits − included_units);  cost = billable × (overage ?? unit_price)
// within free tier → $0;  no price on record → { cost: null, confidence: 'unknown' }
```

DECIMAL columns (returned as strings by mysql2) and tinyint flags are normalised,
so callers get real numbers/booleans.

## Verify

```bash
npm run migrate                                  # applies connector_pricing.sql
npx vitest run tests/connectorProfiles.test.js   # 15 passing
```

## Next

- **Apply to the model:** in `deriveCostModel()`, for each external-tool line
  call `estimateConnectorCost(system, { monthlyUnits: metering external_calls })`
  → set `unit_price`/line cost + confidence; unknown connectors stay null.
  Combine with the platform prices from Phase 4 to finally produce
  `estimated_total`.
