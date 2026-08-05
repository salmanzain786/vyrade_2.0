# Governance & Compliance Scanner — Phase 1 status

Companion to `WORKFLOW_COMPLAINCE.md` (the plan). Tracks what's built and the
decisions the client's review raised.

## Phase 1 — Scanner core (structure + security)

| Milestone | Status | Notes |
|---|---|---|
| 1.1 n8n parser | ✅ Done | `lib/services/scanner/n8nParser.js` — verified on real Vyrade workflows |
| **1.2 Make parser** | ✅ **Done (upload-only)** | `makeParser.js` — parses Make "Export Blueprint" JSON (flow/modules/routers/mapper) into the shared model |
| 1.3 Credential/secret detectors | ✅ Done | reuses `redactSecrets`; hardcoded secrets, embedded URL passwords, insecure `http://` |
| **1.4 Access/exposure** | ✅ **Done (all 3 checks)** | no-auth **+ weak-auth (review) + excessive OAuth scopes (review)** |
| 1.5 AI-specific risk | ✅ Done | prompt-injection exposure, unsafe AI-tool/agent permissions |
| 1.6 Structural/security | ✅ Done | missing error handling, **retry-not-configured**, browser-automation, personal-credential |

Shared model + orchestrator: `model.js`, `scan.js`. API: `POST /api/scanner/scan` (auth-gated).
Every finding has a stable `type` slug (e.g. `public_webhook_no_auth`,
`prompt_injection_exposure`) for Phase 4 framework mapping; ambiguous checks are
marked `manual_review` per the spec's "gap assessment, not certification".

## Decisions resolved from the client review

### 1. Does Vyrade export Make scenarios? → **NO → Make is upload-only**
`makeExporter.js` emits a **markdown implementation guide, not an importable
scenario file** (it says so explicitly). So the scanner's Make support is
**upload-only**: the user brings a Make "Export Blueprint" JSON. `makeParser.js`
parses that standard format. No Vyrade-generated Make fixtures exist, so Make is
tested against representative hand-built scenarios.

### 2. 1.4 was partial → **now complete**
Added the two missing checks the spec called for:
- **Weak auth** — webhook auth weaker than header/JWT/HMAC (e.g. basic) →
  `weak_webhook_auth` (Medium, review).
- **Excessive permissions** — OAuth scope lists broader than a small allowance
  (>4) → `excessive_permissions` (Medium, review).

### 3. Retry analysis — **decision: split across Phase 1 and Phase 6**
- **Phase 1 owns the GENERIC check** (now implemented): external-call nodes with
  no retry configured → `no_retry_configured` (Low, review). The n8n parser now
  extracts `retryOnFail`/`maxTries`.
- **Phase 6 owns POLICY-specific limits** (e.g. "retry limit of 3" as an approved
  Blueprint requirement) — that's a comparison against declared policy, not
  generic scanning, so it belongs with the Blueprint-vs-workflow diff engine.

This split means retry is no longer silently dropped between phases: the generic
"is retry configured at all" lives in Phase 1; the "does it match the approved
limit" lives in Phase 6.

## Still open (unchanged product decisions, not code)
- Phase 6 (Blueprint-aware comparison) in v1, or ship Phases 1–5 standalone first?
- Who owns the Governance & Policy Requirements taxonomy (6.1)?
- Legal/compliance review of the framework-mapping content (Phase 4)?
