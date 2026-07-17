# Vyrade — Automation Blueprint (Next.js)

Turn a plain-language automation request into a **platform-neutral Automation
Blueprint**, then export it to the platform you actually build on. A chat
interview fills the Blueprint in field by field; when it's complete you can
generate an importable **n8n workflow**, a **Claude Code** implementation
package, or a **Make.com / Zapier** implementation guide — all from the same
Blueprint.

Next.js 14 (App Router, JS) · MySQL + Drizzle · OpenAI · Pinecone · cookie-based auth.

---

## Setup

```bash
npm install
cp .env.example .env      # fill in DB, OpenAI, AUTH_SECRET (+ Pinecone / SMTP as needed)
npm run migrate           # creates/updates all MySQL tables (idempotent)
npm run dev               # http://localhost:3000
```

Generate a strong `AUTH_SECRET` (min 16 chars), e.g. `openssl rand -base64 48`.

### Scripts
| Command | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js dev / production build / serve |
| `npm run migrate` | Apply `sql/*.sql` (tolerant re-runs) |
| `npm test` | Vitest suite (deterministic; no network/DB) |
| `npm run test:watch` | Vitest in watch mode |

---

## Environment

Copy `.env.example` and fill in what you need. Only DB + OpenAI + `AUTH_SECRET`
are required; every Pinecone source and SMTP are optional and degrade
gracefully when unset.

- **MySQL** — `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- **OpenAI** — `OPENAI_API_KEY`, `OPENAI_MODEL`, `EMBEDDING_MODEL`
- **Auth** — `AUTH_SECRET` (signs session + reset tokens, keys OTP hashing)
- **Token pricing** (optional) — `OPENAI_PRICE_INPUT` / `OPENAI_PRICE_OUTPUT` per 1M tokens, else the table in `lib/config/pricing.js`
- **Email/OTP** (optional) — `SMTP_HOST/PORT/USER/PASS/FROM`. **If unset, OTP codes print to the server console** so the flows work in local dev with zero setup.
- **Pinecone indexes** — each is its own account/key and is queried in isolation (see *Retrieval sources*):
  - `PINECONE_API_KEY` / `PINECONE_INDEX` — n8n node knowledge (required for n8n generation)
  - `PINECONE_TOOL_*` — Vyrade tools + API docs (→ HTTP nodes)
  - `PINECONE_MCP_*` — MCP connectors (→ Claude package)
  - `PINECONE_MAKE_*` — Make.com modules (→ Make guide)
  - `PINECONE_ZAPIER_*` — Zapier apps (→ Zapier guide)

---

## How a session flows

1. **Sign in** (`/login`, `/register`). New accounts verify by 6-digit email OTP,
   then land in the app. Every page and API is gated to the logged-in user, and
   **you only ever see your own chats.**
2. **Describe the automation** in the chat. The first message creates Blueprint
   v1 and Vyrade asks the first clarifying question — driven by the *actual*
   gaps in the Blueprint, not by the model deciding it's done.
3. **Answer questions.** Each answer `PATCH`es a new immutable version; the
   Blueprint panel updates live. The patch engine is given the **question you
   were asked** together with your answer, so "Only on failures" or "Sarah"
   lands on the right field.
4. **Export** once the Blueprint is `requirements_complete` (the routing bar in
   the Blueprint panel):
   - **n8n** — Full export → interactive n8n canvas + downloadable JSON.
   - **Claude Code** — Full export → a developer package (see below).
   - **Make.com** — Guide only → implementation guide (no fake scenario JSON).
   - **Zapier** — Guide only when its index is configured, else *Coming soon*.

---

## Exports

All exports share one interface (`lib/services/exportService.js`) and one gate:
**an export only runs on a complete, current Blueprint** — otherwise it's
rejected with `409`. Make/Zapier require an explicitly selected platform; a
platform with no index is *Coming soon* (409) unless the API is called with
`allow_generic=true`.

- **n8n workflow** — the n8n Specialist synthesizes a complete, validated,
  importable workflow grounded in retrieved node knowledge + tool API docs. The
  structural validator enforces unique names, a single trigger, numeric
  `typeVersion`, `[x,y]` positions, object `parameters`, and fully-wired
  connections, with a bounded repair loop. Stale detection flags a workflow when
  the Blueprint has since changed.
- **Claude Code package** (`lib/services/claudeExporter.js`) — a ZIP of markdown,
  **not** a workflow file, because Claude Code isn't a workflow engine. Includes
  `README.md`, `CLAUDE.md` (auto-loaded project memory), `architecture.md`,
  `requirements.md`, `business-rules.md`, `claude-prompt.md`, `recommended-mcps.md`,
  `.mcp.json.example`, `MCP_SETUP.md`, `.env.example`, `security-notes.md`,
  `manual-approval-rules.md`, `acceptance-tests.md`, `deployment-notes.md`. It
  carries **read/write safety guardrails** (draft before posting/writing, treat
  browser automation as read-only, never request credentials in chat) and
  **sanitizes all MCP config** — real secret values from the catalog are never
  emitted; only `${PLACEHOLDER}`s that match `.env.example`.
- **Make.com / Zapier guides** (`lib/services/makeExporter.js`) — honest
  implementation guides grounded in each platform's own module/app catalog. No
  hallucinated JSON, and no n8n node names leak into them.

---

## Retrieval sources (n8n generation)

The n8n Specialist grounds generation in **isolated** Pinecone indexes so one
platform's docs never bleed into another's route:

- **n8n node knowledge** — real nodes with exact `type` / `typeVersion` / `parameters`.
- **Vyrade tools + API docs** — when a relevant tool has no first-class node, it's wired as an `httpRequest` node from the documented endpoint/auth (secrets as placeholders).

Make, Zapier, and MCP each have their own isolated indexes used only by their
own exporter. *(Workflow-example retrieval — full example workflows as
structural templates — is the next planned source and not yet wired in.)*

---

## Token accounting

Every LLM call's usage and USD cost is recorded per message
(`conversation_messages.model / prompt_tokens / completion_tokens / total_tokens
/ cost_usd`) and rolled up per conversation
(`conversations.total_tokens / total_cost_usd`, surfaced in the history sidebar).
Cost is computed server-side from the model + token counts.

---

## Auth & security

- **Passwords** hashed with scrypt (`salt:derivedKey`), timing-safe verify.
- **Sessions** are HMAC-signed, httpOnly cookies keyed on `AUTH_SECRET`; the
  user is re-read from the DB each request.
- **OTP** codes are hashed with **HMAC-SHA256 keyed by `AUTH_SECRET`** (not
  plain SHA-256), compared in constant time, single-use, 10-min TTL, 5 attempts.
- **Rate limiting** on all seven auth endpoints — per-email + per-IP windows,
  resend/reset cooldowns, hourly reset caps — backed by an `auth_attempts` table
  that doubles as an **audit log**. Over-limit requests get `429` + `Retry-After`.
- **Ownership** is enforced on every conversation and blueprint route.

---

## Data model (`sql/`)

`schema.sql` (blueprints, versions, conversations, messages, workflows, events),
`auth.sql` (users, OTPs, ownership columns), `usage.sql` (token/cost columns),
`auth_hardening.sql` (audit + rate-limit log). Drizzle mirrors these in
`lib/db/schema.js`. `npm run migrate` applies them idempotently.

---

## Tests & CI

`npm test` runs the Vitest suite — fully deterministic (mocked OpenAI, no DB):
schema/readiness/staleness, n8n structural validation, pricing, the export gate,
MCP secret redaction, auth/OTP hardening, and **recorded-LLM replay tests**
(real OpenAI responses captured once into `tests/fixtures/llm/`, replayed
offline) covering retry `2 → 5`, "only on failures", equivalent phrasings, and
invalid-output repair. Re-record with `RECORD_LLM=1 npx vitest run tests/_record.test.js`.

**GitHub Actions** (`.github/workflows/ci.yml`) runs `npm ci → npm test →
npm run build` on every push/PR. Make it a required check via branch protection
on `main`.

---

## Things to adapt before production

- Set real **SMTP** so verification/reset emails send (otherwise codes only
  print to the server console).
- Point the token **pricing** table / env at your real rates.
- Redact secrets from raw user input before it reaches the LLM.
- Confirm the Pinecone **embedding model** matches how each index was built.
- See `MANUAL-ACTIONS.md` for the running list of decisions/manual steps.
