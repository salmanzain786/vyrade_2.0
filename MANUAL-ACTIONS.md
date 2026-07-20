# Review response — what's fixed, and what still needs you

Response to the P0–P2 review rounds. Everything under **Fixed in code** is done,
verified live, and covered by the test suite + CI. The **Decisions / manual
actions** at the bottom need a human — a product decision or infrastructure only
you can provide.

> Don't trust counts in this file. `npm test` and `npm run build` run in CI on
> every push — check the Actions tab for the authoritative result.

Run once after pulling: `npm install` → `npm run migrate`.

---

## Fixed in code

### Blueprint engine
| Problem | Fix |
|---|---|
| Patch missing the question context | The patch engine receives the **question Vyrade asked + the user's answer**, retrieved **server-side** from the conversation store (the client is never trusted to build it), so "Only on failures" / "Sarah" land on the right field. |
| Incomplete blueprints could generate workflows | A **shared gate** re-derives readiness and throws `BlueprintNotReadyError` (409) unless `requirements_complete` — **before** any LLM call. |
| Generating from a superseded version | Restricted to the **current** version (`StaleVersionError`, 409). |
| Historical version returned the *current* status | Status now comes from **that version's own readiness snapshot**, plus `is_current` / `current_version`. |
| Stale workflows looked current | Workflows are matched to the version they were generated from; the API returns `is_stale` and the UI shows a "Workflow outdated — regenerate" banner. |
| Inconsistent `blueprint.blocked` events | Lifecycle events now match the persisted status; no spurious BLOCKED while `collecting_requirements`. |
| Human-approval clarification loop | A question is forced only while a *structural* must-have is missing; afterwards the agent may finish instead of re-asking a declined point. Missing details are surfaced as **plain-English questions**, never raw field paths. |
| Neutrality validator too blunt | `constraints.implementation_constraints` preserves "we must stay on n8n" as a **user constraint**; the neutrality scan exempts that subtree only. |
| n8n validator didn't prove importability | Enforces numeric `typeVersion`, `[x,y]` positions, object `parameters`, exactly one trigger, full wiring — with a bounded repair loop. |

### Retrieval (the moat)
| Problem | Fix |
|---|---|
| Generation was "node docs + LLM" | n8n generation now grounds in **three isolated sources**: **workflow examples** (real workflows as structural templates — Pinecone → `mysql_id` → `WORKFLOW_JSON` hydrated from MySQL and compacted to a skeleton), **n8n node knowledge**, and **Vyrade tools + API docs** (wired as `httpRequest` nodes). Examples are placed first; the Blueprint always wins on conflict. |
| Make/Zapier had no path | Foundation built on a **shared exporter interface** — no duplicated engine. Each platform uses its **own isolated index**, so platform docs can't bleed into the n8n or Claude routes. |

### Exports
| Problem | Fix |
|---|---|
| Claude/Make/Zapier bypassed the readiness gate | **All** platforms go through the same gate (complete + current, or 409). The old ungated `/claude-export` route was deleted. |
| Zapier "Coming soon" in UI but the API still produced a guide | One rule: `coming_soon` → **409**, unless the caller explicitly passes `allow_generic=true`. UI and API can no longer disagree. |
| Claude package incomplete | Now 14 files incl. `CLAUDE.md` (auto-loaded project memory), `.mcp.json.example`, `MCP_SETUP.md`, `security-notes.md`, `manual-approval-rules.md`, with **read/write guardrails** (draft before writing/posting, browser read-only, never request credentials in chat). |
| No fake JSON for unsupported platforms | Make/Zapier emit **honest implementation guides** grounded in their own catalogs — never a hallucinated scenario/Zap file, and no n8n node names. |

### Security
| Problem | Fix |
|---|---|
| MCP config could leak catalog secrets | `sanitizeMcpConfig` is **fully recursive** over the whole server config (any depth, objects + arrays), redacting by key name *and* value shape, with a depth cap. Unparseable config is dropped rather than rendered raw. |
| Raw user input reached the LLM/DB unredacted | **Pre-LLM redaction** at all 5 entry points — provider tokens, JWTs, `Bearer`/`Basic`, PEM keys, Slack webhooks, DB/SMTP URL passwords, generic `password:`/`api_key=`. Applied **before the model and before persistence**; originals are never stored. |
| Weak OTP hashing | OTPs are **HMAC-SHA256 keyed with `AUTH_SECRET`** (not plain SHA-256) with constant-time compare — a DB-only leak no longer reverses a 6-digit code. |
| No auth rate limiting | Per-email + per-IP windows, resend/reset cooldowns, hourly reset caps on **all 7** auth endpoints → `429` + `Retry-After`, backed by an `auth_attempts` **audit log**. |
| `X-Forwarded-For` was blindly trusted | XFF is **ignored unless `TRUST_PROXY`** declares how many proxies sit in front; the client IP is then read N entries **from the right** so a spoofed left-hand value is discarded. Platform headers (Cloudflare/Vercel) are always honoured. |
| Audit table grew forever | Two-tier retention: full detail → **PII stripped at 30d** → **deleted at 90d** (batched). Prunes opportunistically in-app (max hourly) plus `npm run cleanup:auth-audit` for cron. |

### Tests & CI
| Problem | Fix |
|---|---|
| No CI — "N passing" was an unverifiable claim | **GitHub Actions** runs `npm ci → npm test → npm run build` on every push/PR (`.github/workflows/ci.yml`), with CI-safe dummy env. |
| LLM-dependent cases untested | **Recorded-LLM replay tests**: real OpenAI responses captured once into `tests/fixtures/llm/`, replayed offline with the client mocked. Covers *retry twice → 2*, *change to five → 5*, *"only on failures"*, equivalent phrasings, and invalid-output repair. Re-record with `RECORD_LLM=1 npx vitest run tests/_record.test.js`. |

---

## Decisions / manual actions needed

### 1. Standalone app vs. integration into existing Vyrade — **your call**
This repo is a self-contained Next.js app (own chat UI, Blueprint panel, MySQL,
API). The spec described adding a Blueprint **layer** to the existing product,
not a parallel product. I have not restructured toward either, because it
changes where every module lives. Tell me the target and I'll produce the
integration plan.

### 2. Real n8n import smoke test — **built; needs your instance to switch on**
The full pipeline is implemented and tested (against a mocked n8n):

```
generate → import into test n8n → reject? repair with n8n's own error
                                → accept? mark export verified
```

It is **inactive until you provide a throwaway instance**:

```bash
N8N_TEST_URL=https://n8n-test.internal
N8N_TEST_API_KEY=n8n_api_...
```

Use a disposable instance, never production — each check creates and then
deletes a workflow. Add the same two values as CI secrets to run the check on
every push. Result is stamped on `workflow.meta.import_check`
(`verified` / `failed` / `skipped`) and badged in the workflow modal.

### 3. Make CI a required check — **GitHub setting, not code**
The workflow exists but must be enforced:
**Settings → Branches → protect `main` → Require status checks → `test & build`.**

### 4. Workflow-example coverage — **pending your data migration**
Retrieval is wired and live, but the Pinecone index references more rows than
`vyrade_blueprint.n8n_node_workflows` currently holds (~36% of matches hydrate
today). Retrieval **over-fetches and skips** what it can't hydrate, so coverage
improves automatically once you migrate the full data — **no code change**.
`WORKFLOW_EXAMPLE_DB` / `WORKFLOW_EXAMPLE_TABLE` can re-point the source.

### 5. Operational insights — **not yet a source**
The remaining moat layer (run/failure telemetry feeding generation) has no index
or data source yet. Point me at one and it slots in beside the other three.

### 6. Historical-version export — **built, deliberately not exposed**
Exports are current-version-only. The service accepts `allowHistorical` (and the
route `allow_historical`), but no UI surfaces it. Say the word if you want it.

### 7. Production config you must set
- Real **SMTP** — otherwise OTP codes only print to the server console.
- **`TRUST_PROXY`** to match your deployment, or per-IP limits stay inactive.
- Real **token pricing** (`OPENAI_PRICE_*` or the table in `lib/config/pricing.js`).
- Confirm each Pinecone index's **embedding model** matches how it was built.

---

## How to verify
```bash
npm test                    # deterministic: no network, no DB
npm run build               # compiles every route + middleware
npm run cleanup:auth-audit  # applies the audit retention policy
npm run dev                 # manual: incomplete blueprint → export → 409; complete → ok
```
