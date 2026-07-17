# Blueprint review — fixes applied & what needs you

This documents the response to the P0–P2 problem report. Everything marked
**FIXED** is done, verified, and covered by the build and/or the test suite
(`npm test`, and CI runs it on every push — see the badge/Actions tab rather
than trusting any hardcoded count in this doc). The **DECISION / MANUAL** items need a human — either a
product decision (Salman) or infrastructure you must provide.

Run once after pulling: `npm install` then `npm run migrate` (the auth +
blueprint changes are already migrated on this machine).

---

## Fixed in code

| # | Problem | Fix | Where |
|---|---------|-----|-------|
| P0‑1 | Patch missing the question context | The patch engine now receives the **question Vyrade asked + the user's answer**, retrieved **server‑side** from the conversation store (client is never trusted to build it). | `blueprintService.patchFromClarification`, `conversationRepository.getLastAssistantQuestion`, `blueprintGenerator.patchBlueprintContent` |
| P0‑2 | Backend let incomplete blueprints generate workflows | `generateWorkflow` now re‑derives readiness and **throws `BlueprintNotReadyError` (409)** unless `requirements_complete`, **before** calling the n8n specialist. Verified live: incomplete blueprint → 409. | `blueprintService.generateWorkflow`, `blueprintErrors.js` |
| P0‑2b | Generating from a non‑current version | Generation is restricted to the **current** version (`StaleVersionError`, 409). Historical‑version generation is intentionally **not** offered (see Decisions). | same |
| P0‑3 | Old workflows look current after Blueprint changes | Workflows are matched to the version they were generated from; the conversation API returns `workflowMeta { generated_from_version, current_blueprint_version, is_stale }` and the UI shows a **"Workflow outdated — regenerate"** banner. | `blueprintRepository.getLatestWorkflowRecord` / `getWorkflowForBlueprintVersion`, `workflowStatus.isWorkflowStale`, conversation route, `BlueprintSheet`, `ChatWorkspace` |
| P0‑4 | Historical version returned the *current* status | `formatBlueprintRow` now derives status from **that version's own readiness snapshot** (`readinessJson.status`) and adds `is_current` / `current_version`. Verified live. | `blueprintRepository.formatBlueprintRow` |
| P1‑7 | Inconsistent BLOCKED events | Lifecycle events now **match the persisted status** — `emitStatusEvent` only emits `blueprint.completed` when complete and never emits a spurious `blueprint.blocked` while the row is `collecting_requirements`. (See the revised note below on how "blocked" is surfaced.) | `blueprintService.emitStatusEvent`, `readiness.checkReadiness` |
| P1‑8 | Human‑approval clarification loop (MUST‑ASK + DO‑NOT‑ASK‑AGAIN) | The interview forces a **streamed** question only while a *structural* must‑have is missing; once those are in place it may finish, so it keeps asking about underspecified details but is no longer forced to re‑ask a point the user already declined. Missing details are always surfaced as **plain‑English questions**, never raw field paths. | `readiness`, `clarificationAgent.prepareQuestion` |
| P2 | Neutrality validator too blunt for platform lock‑in | New `constraints.implementation_constraints` ({required/prohibited/existing/preferred}_platforms) preserves "we must stay on n8n" as a **user constraint**; neutrality scan **exempts that subtree** but still bans platform terms everywhere else. | `blueprintSchema.js`, generator system prompt |
| P2 | n8n validator didn't prove importability | Validator now enforces numeric `typeVersion`, `position` = `[x,y]` numbers, `parameters` is an object, and **exactly one** trigger — matching the specialist's own prompt. | `n8nSpecialist.validateWorkflow` |
| P1‑6 | No automated tests | Added **vitest** suite (`tests/`, 25 tests): contradictory rules, referential/sequence, unknown volume, blocked/loop, neutrality + implementation_constraints, n8n structural validation, workflow staleness, 409 gate errors. Run `npm test`. | `tests/`, `vitest.config.js` |

### Notes on the fixes
- **DB:** `constraints.implementation_constraints` is now required by the schema, so **new** generations/patches always include it. Blueprints created before this change are read as‑is (not re‑validated) and won't crash the sheet; the field is filled the next time the model patches them.
- **On "blocked" (revised from the first pass):** the first version derived `blocked` from Blueprint content, which caused a real regression — the model records `unknown_requirements` for anything *underspecified* (not just things the user declined), so the agent stopped asking and dumped raw field paths (`systems.Spreadsheet.location_and_access`, …). Corrected: **every open item is asked in plain language**; whether something is truly unresolvable is a conversational judgment left to the clarification agent, not guessed from content. So content status is now `collecting_requirements` / `requirements_complete` only, and "still needed" items are shown as friendly questions. A distinct persisted `blocked` status (set when the agent ends the interview with items the user genuinely can't provide) is a small follow‑up if you want the red BLOCKED stamp back — say the word.

---

## Decisions / manual actions needed

### 1. (P0/P1‑5) Standalone app vs. integration into existing Vyrade — **your call, blocks direction**
This repo is a self‑contained Next.js app (own chat UI, Blueprint sheet, MySQL,
API). Your spec meant **existing chat → existing clarification → NEW Blueprint
layer → existing/updated RAG → generation**, i.e. add a Blueprint *layer* to the
current product, not build a parallel product.

**Nothing further should be built on top of this until you decide:** POC to be
merged into the current backend, or a rebuild. I did not restructure toward
either, because it changes where every module should live. Tell me the target
and I'll produce the integration plan (which pieces move into the existing
chat/backend, which stay).

### 2. (P1‑9) n8n generation uses only the node DB — **needs your data sources**
Current generation = Blueprint + **Pinecone n8n node knowledge** only. Your moat
also has **workflow‑example DB, tool DB, and API docs**. Wiring those into the
retrieval router is an enhancement I can build, but it needs:
- access/credentials + index names for the workflow‑example, tool, and API‑doc stores;
- confirmation of the retrieval order you want (workflow examples → nodes → tools → API docs).

Until then generation is intentionally node‑only — it does **not** replace the
richer retrieval, it just doesn't use sources this repo can't reach yet.

### 3. (P2) Real n8n import smoke test — **needs a controlled n8n instance**
`validateWorkflow` now checks structure/importability heuristics, but the gold
standard is a **test import against a real n8n**. To add that I need a throwaway
n8n URL + API key (ideally in CI). Give me those and I'll add a
generate → import → PASS/REPAIR step.

### 4. LLM‑dependent QA cases — **can't be deterministically unit‑tested**
Cases like "retry twice → `retries = 2`", "change to five → `retries = 5`",
invalid‑JSON repair, and equivalent‑wording all depend on the model. The
deterministic logic around them **is** tested; the model behavior itself should
be covered by **integration tests with recorded/mocked LLM responses**. I can add
that harness (records a fixture on first run, replays after) if you want it —
it's the right way to lock these without paying per test run.

### 5. Historical‑version workflow generation — **intentionally not built**
Per the report's recommendation, generation is **current‑version‑only**.
Generating a workflow from an old version would be a separate, explicit action.
Say the word if you want that surfaced in the UI.

---

## How to verify
```bash
npm test          # 25 deterministic tests
npm run build     # full compile of every route + middleware
npm run dev       # manual: create vague blueprint → generate → 409; complete → generate ok
```
Live‑verified this round: P0‑2 (409 gate, no n8n call), P0‑4 (per‑version status).
