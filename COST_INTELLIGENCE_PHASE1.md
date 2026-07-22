# Cost Intelligence — Phase 1 (Taxonomy) ✅

Phase 1 of the Cost Intelligence Engine ([COST_INTELLIGENCE.md](COST_INTELLIGENCE.md)).
This phase builds the **cost taxonomy and structure — deliberately NOT price
scraping.** It answers *"what will this automation bill me for, and how does
each cost scale?"* without inventing a single dollar figure.

> The cardinal rule: **never present a guess as an exact cost.** Every
> `unit_price` is `null` in Phase 1. Missing price → `unknown` + an honest note,
> never a hallucinated number.

## What shipped

| File | Role |
|------|------|
| `lib/services/cost/taxonomy.js` | The 9 cost categories, controlled vocabularies (billing unit, confidence, price source), and `makeCostItem()` — the only sanctioned way to build a validated cost line. |
| `lib/services/cost/volume.js` | Normalises `blueprint.volume` → `monthly_runs`; falls back to a default at **low confidence** when volume is missing (never silently invented). |
| `lib/services/cost/costModel.js` | `deriveCostModel({ blueprint, platform, monthlyRuns? })` — maps a Blueprint + platform to the full list of structural cost items. |
| `tests/costModel.test.js` | 20 tests covering every QA scenario + Definition of Done. |

## The 9 cost categories

1. **Orchestration platform** — the n8n/Make/Zapier plan (or Claude Code)
2. **Execution / task / credit** — metered per run (Zapier tasks, Make operations, n8n executions)
3. **External API / tool** — third-party SaaS + API usage for each system
4. **LLM token** — model spend for `ai_reasoning` / `generate_content` steps
5. **MCP connector** — Claude Code connectors (usually free; underlying APIs bill)
6. **Hosting / infrastructure** — VPS/container for self-hosted n8n
7. **Storage / logging** — execution history + retention
8. **Human approval / manual operations** — human time the automation still needs
9. **Unknown cost drivers** — a standing honest catch-all (overages, reruns, maintenance)

## Cost-item shape

```js
{
  component: 'Zapier',
  category: 'execution_task_credit',           // one of the 9
  cost_type: 'platform_task_usage',
  billing_unit: 'task',
  quantity_formula: 'monthly_runs * billable_action_steps',
  quantity_estimate: 8692,                      // best-effort, from the Blueprint
  unit_price: null,                             // Phase 1: ALWAYS null
  currency: 'USD',
  price_source: 'official_pricing_page',
  confidence: 'medium',
  notes: 'Zapier bills one task per action step…'
}
```

## How it reads the Blueprint

- `volume.{estimated_executions, period}` → `monthly_runs` (day/week/month/year converted)
- `process_steps[].action_type` → `ai_reasoning`/`generate_content` add a **token** line; `human_approval` adds a **manual-ops** line
- `systems[]` + `trigger.source_system` → one **external tool** line each (and, for Claude, one **MCP connector** each)
- `constraints.self_hosting_required` → n8n **hosting** line (assumed self-hosted unless explicitly `false`)
- `unknown_requirements[].blocks_cost_confidence` → folded into assumptions, lowering confidence

## What Phase 1 does NOT do (later phases)

- **Phase 2 — Pricing data:** `tool_pricing` + `platform_pricing_assumptions` tables, admin override fields, `unit_price`/`estimated_total` populated, `last_checked` + source URLs. Only then do dollar amounts appear.
- **Phase 3 — Surfacing:** an API route + Blueprint-panel UI showing the breakdown per recommended platform, side-by-side cost comparison.

The engine is built so Phase 2 only fills in `unit_price` — the structure,
formulas, and confidence model don't change.

## Verify

```bash
npx vitest run tests/costModel.test.js   # 20 passing
```
