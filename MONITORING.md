# Error Monitoring (Sentry)

Production errors report to Sentry with safe context and **no PII**. This doc
covers what's wired in code and the deploy-time config you still set.

## What's in code

| Layer | Where | Notes |
|---|---|---|
| Client init | `instrumentation-client.js` | Session Replay intentionally OFF (DOM shows Blueprint text). |
| Server init | `sentry.server.config.js` | Node runtime (route handlers, RSC, actions). |
| Edge init | `sentry.edge.config.js` | Middleware / edge routes. |
| Shared hardening | `lib/monitoring/sentryScrub.js` | env DSN, prod-gated, traces sampled, **`beforeSend` scrubs PII**. |
| API route capture | `lib/auth/guard.js` → `lib/monitoring/capture.js` | 5xx faults report with `route` + user **id** (never body/email). |
| Client boundaries | `components/ErrorBoundary.js` | Wraps ChatWorkspace, BlueprintSheet, WorkflowModal. |
| Global fallback | `app/global-error.jsx` | Root render crashes. |

**Privacy:** `sendDefaultPii: false`, console logs off, and every event passes
through `scrubEvent` — request body/cookies/query-string dropped, headers
allowlisted, user reduced to `{ id }`, console breadcrumbs removed, query
strings stripped. Proven by `tests/sentryScrub.test.js`.

## Deploy-time config (env)

```
NEXT_PUBLIC_SENTRY_DSN=...      # REQUIRED to enable monitoring (no fallback)
SENTRY_ENV=production          # environment tag
SENTRY_RELEASE=<git-sha>       # 1.5 release tracking — CI should set this
SENTRY_AUTH_TOKEN=...          # BUILD-ONLY, secret — uploads source maps in CI
```
Reporting is gated to `NODE_ENV=production`. For a local test, set
`SENTRY_ENABLE_DEV=1`.

## Wiring credentials (deploy / CI)

There are **two** environments, because errors report from the running app but
source maps are uploaded at build time. Set the vars in both.

### A. GitHub Actions (build + source-map upload) — already wired

`.github/workflows/ci.yml`'s Build step consumes:
- `SENTRY_RELEASE` = `${{ github.sha }}` (automatic, no setup).
- `SENTRY_AUTH_TOKEN` = `${{ secrets.SENTRY_AUTH_TOKEN }}` — **you add this secret.**
- `NEXT_PUBLIC_SENTRY_DSN` = `${{ vars.NEXT_PUBLIC_SENTRY_DSN }}` — optional repo *variable*.

Add them in GitHub → **Settings → Secrets and variables → Actions**:
- **Secrets** tab → New secret → `SENTRY_AUTH_TOKEN` (from Sentry → Settings →
  Auth Tokens → create a token with the **`project:releases`** scope).
- **Variables** tab → New variable → `NEXT_PUBLIC_SENTRY_DSN` (optional; the DSN
  is public, so it's a variable, not a secret).

### B. Production host / VPS (runtime + the production build)

Set these where the app is **built and run** for production (e.g. `.env.production`
on the VPS, or your process manager's env):
```
SENTRY_DSN=https://...ingest.sentry.io/...   # server-side runtime DSN
NEXT_PUBLIC_SENTRY_DSN=https://...            # client bundle DSN (same value)
SENTRY_ENV=production
SENTRY_RELEASE=<the deployed commit SHA>      # e.g. $(git rev-parse HEAD) at build
SENTRY_AUTH_TOKEN=<token>                     # only if you build on the VPS (source maps)
```
Reporting only activates when `NODE_ENV=production` (or `SENTRY_ENABLE_DEV=1`).

**Where to get the DSN:** Sentry → your project → Settings → Client Keys (DSN).

> If GitHub Actions is not your deploy step (you build on the VPS), the
> authoritative source-map upload happens on the VPS build — so `SENTRY_AUTH_TOKEN`
> + `SENTRY_RELEASE` must be present there. The CI upload is then a harmless
> extra keyed to the same SHA.

## 1.5 Release tracking

`SENTRY_RELEASE` (the commit SHA) is wired into CI above; set the same value in
the production build so every event pins to its deploy. The Sentry build plugin
also auto-detects the SHA from git — the env var just makes it explicit.

## 1.6 Alerting (Sentry dashboard — no code)

Nothing in this repo controls alert rules; they live in Sentry's settings.
Set up the two rules below once the project is live.

### Step 0 — connect a notification channel
- **Slack:** Sentry → **Settings → Integrations → Slack → Add** → authorize the
  workspace → pick the channel (e.g. `#vyrade-alerts`).
- **Email** works with no setup (goes to project members).

### Rule 1 — new issue type (a never-seen-before error)
Sentry → **Alerts → Create Alert Rule → Issues**:
- WHEN: *A new issue is created*.
- IF (optional): environment = `production` (ignore dev noise).
- THEN: *Send a notification to* Slack `#vyrade-alerts` (and/or email).
- Name it "New issue — production".

### Rule 2 — error-rate spike (something is broadly broken)
Sentry → **Alerts → Create Alert Rule → Issues** (or *Metric alert* for a rate):
- WHEN: *Number of events in an issue is more than* **10 in 1 hour**
  (tune to your traffic), OR a **Metric alert** on error count/rate over a
  window (e.g. > 25 errors in 5 min).
- IF: environment = `production`.
- THEN: notify Slack/email.
- Name it "Error spike — production".

### Verify
Trigger a test error (the `/monitoring-check` harness) and confirm the
Slack/email alert fires. Tune thresholds after a week of real traffic so alerts
stay signal, not noise.

## 1.7 Verify each layer — one real end-to-end pass

There's a built-in harness at **`/monitoring-check`** covering all three layers.
It's always on in dev; in production it 404s unless `MONITORING_CHECK_ENABLED=1`.

### Prerequisites
- Item #1 done — a **real DSN** connected (else nothing reaches the dashboard).
- Reporting enabled: production automatically, or in dev set `SENTRY_ENABLE_DEV=1`
  and **restart** the dev server.
- Be **signed in** (the server-layer check runs through `withAuth`, so it needs a
  user — that's how it proves the user-id context).

### Run it
Open `/monitoring-check` and click each button:

| Button | Layer | Confirm in Sentry → Issues |
|---|---|---|
| Throw inside boundary | Client, wrapped region | event tagged `boundary: monitoring-check`; the region shows the fallback UI (no white screen). |
| Throw uncaught | Global fallback | the exception reports; app error screen shows. |
| Call failing API | Server route (`withAuth`) | `MonitoringCheckError` 500 with tags `route=/api/monitoring-check`, `http.method=GET`, and **your user id** — and **no request body**. |

### The privacy check (do this every event)
Open each event's JSON and confirm there is **no** email, cookie, Blueprint text,
or query string — only the stack trace + safe tags. (This is also enforced by
`tests/sentryScrub.test.js`.)

### After the pass
In production, **unset `MONITORING_CHECK_ENABLED`** so `/monitoring-check` 404s
again. Optionally delete `app/monitoring-check`, `app/api/monitoring-check`, and
`components/MonitoringCheck.js` once signed off.
