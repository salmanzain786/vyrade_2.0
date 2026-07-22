# Cost Intelligence — Phase 4 (Pricing Source Registry) ✅

Phase 4 adds the first **persisted** layer: a `pricing_sources` table that
records *where every price comes from*, plus the governance that keeps the
engine honest — **only official pricing/help pages can produce a
high-confidence price**, and a component with no source resolves to
`{ price: null, confidence: 'unknown' }` rather than a guess.

Still **no prices applied to the cost model** — this phase builds the registry
and the rules; wiring resolved prices into `deriveCostModel()` is the next phase.

## What shipped

| File | Role |
|------|------|
| `sql/pricing.sql` | `pricing_sources` table (registered in `scripts/migrate.js`, applied ✓). |
| `lib/db/schema.js` | Drizzle mirror (`pricingSources`). |
| `lib/services/cost/pricingSources.js` | **Pure governance**: source types, confidence caps, `resolvePricingFromSource()`, the `noSourceResult()` fallback. |
| `lib/services/cost/pricingSourceRepository.js` | DB access: `getBestPricingSource`, `resolvePricing`, `upsertPricingSource`, `listPricingSources`, `touchLastChecked`. |
| `tests/pricingSources.test.js` | 15 tests (pure governance + mocked-pool repository). |

## The table

```
pricing_sources
  id, provider, component_type, pricing_url,
  source_type, extraction_method, confidence,
  raw_snapshot (MEDIUMTEXT), parsed_json (JSON), notes,
  last_checked_at, created_at, updated_at
  UNIQUE (provider, component_type, source_type)
```

`source_type` ∈ `official_pricing_page` · `official_help_doc` · `api_docs` ·
`manual_entry` · `user_provided` · `inferred` · `unknown`.

## The governing rule (enforced in code)

`MAX_CONFIDENCE_BY_SOURCE` caps the confidence a price may carry by its origin —
enforced no matter what a row *claims*:

| source_type | max confidence |
|-------------|:--:|
| official_pricing_page | **high** |
| official_help_doc | **high** |
| api_docs | medium |
| manual_entry | medium |
| user_provided | low |
| inferred | low |
| unknown | unknown |

So an `inferred` row that stores `confidence: 'high'` resolves to **low** — the
number can be *used*, but never presented as trustworthy. And with no source at
all:

```json
{ "price": null, "confidence": "unknown",
  "reason": "No official pricing source found for this component." }
```

> This is better than hallucinating. Verified live end-to-end against the DB:
> no-source → unknown, official → high, inferred-claiming-high → clamped to low.

## Which source wins

`getBestPricingSource()` orders deterministically in SQL: **official pages
first**, then higher stated confidence, then most-recently `last_checked_at`. So
an official page always beats a manual/inferred entry for the same component.

## Usage

```js
import { resolvePricing, upsertPricingSource } from '.../pricingSourceRepository.js';

// Register an official price (e.g. from an admin screen or a scraper).
await upsertPricingSource({
  provider: 'zapier', componentType: 'platform_task_usage',
  sourceType: 'official_pricing_page', pricingUrl: 'https://zapier.com/pricing',
  confidence: 'high', parsedJson: { price: 0.0288, currency: 'USD', per: 'task' },
});

// Resolve — governed price, or the honest unknown.
const { price, confidence, reason } = await resolvePricing('zapier', 'platform_task_usage');
```

`upsert` is keyed on `(provider, component_type, source_type)`, so re-checking a
page refreshes its snapshot/price/`last_checked_at` in place. Timestamps are
always caller-supplied (no implicit `Date.now()`), keeping the module pure and
testable.

## Verify

```bash
npm run migrate                              # applies sql/pricing.sql
npx vitest run tests/pricingSources.test.js  # 15 passing
```

## Next

- **Apply prices:** in `deriveCostModel()`, look up `resolvePricing(provider,
  component_type)` per line → populate `unit_price`, compute
  `estimated_total = Σ(unit_price × quantity_estimate)`, and set each line's
  confidence from the source. Missing sources keep `unit_price: null`.
- **Admin surface + snapshots:** a screen to enter/override prices and store
  `raw_snapshot` for provenance.
