# Analytics (Mixpanel)

Vyrade tracks product events in Mixpanel using a **dual pipeline**:

- **Client SDK** (`mixpanel-browser`) — user identity, page views, and UI intent
  (clicks, form submits, modal opens). Fast, rich, but can be blocked by
  ad-blockers.
- **Server SDK** (`mixpanel`) — the *authoritative* business events fired from
  API routes (a blueprint really was created, a workflow really was generated,
  a login really succeeded), including data the browser never sees: token
  usage, USD cost, node counts, real-import results. Immune to ad-blockers.

The two halves are stitched together by **distinct_id = user id**: the client
calls `mixpanel.identify(userId)` on load, and every server event is keyed by
the same id.

## Setup

1. Create a Mixpanel project → **Settings → Project Settings → Project Token**.
2. Put it in `.env`:
   ```
   NEXT_PUBLIC_MIXPANEL_TOKEN=your_project_token
   ```
   The same token serves the browser and the server. It is not a secret (it
   ships to the client regardless). **EU data residency?** Uncomment the two
   `*_API_HOST` lines in `.env`.
3. Restart the app (env is read at boot).

With **no token set, analytics is a safe no-op** everywhere — nothing is sent,
nothing breaks. That's the default for local dev, CI, and tests.

## Where it lives

| File | Role |
|------|------|
| `lib/analytics/events.js` | Canonical event-name constants (shared client + server) |
| `lib/analytics/mixpanel.js` | Client wrapper: `initAnalytics`, `identifyUser`, `track`, `resetAnalytics` |
| `lib/analytics/AnalyticsProvider.js` | Boots the client SDK + tracks page views (mounted in root layout) |
| `lib/analytics/server.js` | Server wrapper: `trackServer`, `setPerson` (fire-and-forget, never throws) |

## Tracked events

### Identity & navigation (client)
- **Page Viewed** — every route change (chat ids collapsed to `/chat/[id]`)
- **Theme Toggled** — `{ theme }`

### Auth — UI intent (client)
- **Sign Up Submitted**, **Login Submitted**, **Verify Email Submitted**,
  **Resend OTP Clicked**, **Forgot Password Submitted**,
  **Reset Password Submitted**, **Sign Out Clicked**

### Auth — outcomes (server, authoritative)
- **Signed Up** — `{ email, resent }` (+ people profile set)
- **Logged In** — `{ email }` (+ people profile)
- **Login Failed** — `{ email, reason, status, rate_limited, needs_verification }`
- **Email Verified** — `{ email }`
- **OTP Resent**, **Password Reset Requested**, **Password Reset Completed**
- **Logged Out** — `{ email }`

### Chat (client)
- **Message Sent** — `{ session_id, is_first_message, char_count }`
- **New Chat Clicked**, **Conversation Selected**, **Chat History Opened**

### Blueprint (server, authoritative)
- **Blueprint Created** — `{ blueprint_id, version, status, readiness_score, systems_count, process_steps_count }`
- **Blueprint Updated** — `{ blueprint_id, version, status, readiness_score }`
- **Blueprint Finalized** — `{ blueprint_id, version, status, readiness_score }`
- **Blueprint Ready** — milestone fired only when status = `requirements_complete`

### Workflow generation
- **Generate Workflow Clicked** *(client)* — `{ blueprint_id, readiness_score, is_regenerate }`
- **Workflow Generated** *(server, authoritative)* — `{ blueprint_id, version, node_count, import_check, repair_attempts, prompt_tokens, completion_tokens, total_tokens, cost_usd, model }`
- **Workflow Generation Failed** *(client)* — `{ blueprint_id, error, duration_ms }`
- **Workflow Viewed** *(client)* — `{ blueprint_id, source, node_count?, duration_ms? }`
- **Workflow Downloaded** *(client)* — `{ blueprint_id, node_count }`

### Export
- **Export Modal Opened** *(client)* — `{ blueprint_id, readiness_score }`
- **Export Platform Selected** *(client)* — `{ blueprint_id, platform }`
- **Export Completed** *(server, authoritative)* — `{ blueprint_id, platform, kind, readiness, grounded, file_count }`
- **Export Failed** *(client)* — `{ blueprint_id, platform, error }`
- **Claude Prompt Copied** *(client)* — `{ blueprint_id }`

### Cost / usage (server)
- **LLM Usage** — `{ operation, blueprint_id, total_tokens, cost_usd, model }`

## Notes on de-duplication

Key business events (**Workflow Generated**, **Export Completed**) are fired
**server-side only** so they can't be inflated by client retries or suppressed
by ad-blockers. The client fires the matching *intent* (`… Clicked` /
`… Selected`) and *failure surface* events, never the authoritative success —
so nothing double-counts. Build funnels like:

```
Message Sent → Blueprint Ready → Generate Workflow Clicked → Workflow Generated → Export Completed
```
