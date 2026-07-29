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
NEXT_PUBLIC_SENTRY_DSN=...      # override the baked-in project DSN if needed
SENTRY_ENV=production          # environment tag
SENTRY_RELEASE=<git-sha>       # 1.5 release tracking — CI should set this
SENTRY_AUTH_TOKEN=...          # BUILD-ONLY, secret — uploads source maps in CI
```
Reporting is gated to `NODE_ENV=production`. For a local test, set
`SENTRY_ENABLE_DEV=1`.

## 1.5 Release tracking

Set `SENTRY_RELEASE` to the commit SHA in CI so every event pins to a deploy:

```yaml
# CI (GitHub Actions)
env:
  SENTRY_RELEASE: ${{ github.sha }}
  SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}
```
The Sentry build plugin also auto-detects the SHA from git; the env var wins.

## 1.6 Alerting (Sentry dashboard — no code)

In **Sentry → Alerts → Create Alert Rule**:
1. **New issue** → notify immediately (a never-seen-before error).
2. **Issue frequency / error-rate spike** → e.g. "> 10 events in 1h" or
   "error rate > X%".
3. Route to **Slack** (Settings → Integrations → Slack) and/or email so no one
   has to watch the dashboard.

## 1.7 Verify each layer

With `SENTRY_ENABLE_DEV=1` (or on staging), trigger one error per layer and
confirm it appears in Sentry with `route`/`boundary` tags and the user id:

- **Client component:** visit `/sentry-example-page` (wizard page) and click the
  throw button, or temporarily throw inside a boundary-wrapped component.
- **API route:** hit an authenticated route that throws (or add a temporary
  `throw new Error('sentry test')` in a `withAuth` handler) → expect a 500 issue
  tagged with the route + your user id, and **no** request body in the event.
- **Server action / RSC:** throw in a server component → `app/global-error.jsx`
  renders and the exception reports.

Confirm in each event that there is **no** email, cookie, Blueprint text, or
query string — only the stack trace + safe tags.
