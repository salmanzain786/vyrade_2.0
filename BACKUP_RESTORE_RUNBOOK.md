# Backup + Restore — Runbook & Decision Record

Companion to `BACKUP_RESTORE_PHASE.md` (the plan). This file captures the
**decisions and evidence** for each milestone as it's completed. Hosting:
**Coolify on a Hostinger VPS**, MySQL database `vyrade_blueprint`.

## Milestone status

| # | Milestone | Status |
|---|---|---|
| 2.1 | Define RPO/RTO | ✅ **Decided** (below) |
| 2.2 | Confirm MySQL is a Coolify-managed resource | ⬜ Pending |
| 2.3 | Configure Coolify native backup schedule | ⬜ Pending |
| 2.4 | Pinecone export/regeneration strategy | ⚠️ **Documented — tooling gap flagged** (below) |
| 2.5 | Retention policy | ✅ **Decided** (below) |
| 2.6 | Coolify instance backup (in scope?) | ✅ **Decided** (below) |
| 2.7 | Restore runbook | ✅ **Written** (below) + `npm run verify:restore` |
| 2.8 | Actual restore test | 🟡 **Local rehearsal PASSED** — real VPS test pending 2.3 |
| 2.9 | Document + schedule recurrence | ✅ **Log + recurrence set** (below) |

---

## 2.1 — RPO / RTO (decided 2026-07-29)

| Objective | Value | Meaning |
|---|---|---|
| **RPO** (Recovery Point Objective) | **12 hours** | Max acceptable data loss. On a worst-case restore we may lose up to the last 12h of writes. |
| **RTO** (Recovery Time Objective) | **4 hours** | Max acceptable time to recover. From "we decide to restore" to "app live on restored data" must be ≤ 4h. |

### What drives these numbers

The data actually protected by these objectives is **user-created blueprints,
their versions, and the conversations** that produced them — irreplaceable
customer work product. Everything else is either very low-churn (users/auth) or
**regenerable**, so it does not tighten the requirement:

| Data | Regenerable? | Notes |
|---|---|---|
| Blueprints + versions, conversations/messages | ❌ No | The reason RPO exists. |
| Users / auth | ❌ No | High value, but near-zero churn. |
| Generated workflows, recommendation_runs, export_runs, operational_events | ⚠️ Re-derivable from blueprints (LLM token cost) | Losing recent rows is tolerable. |
| Reference/seed data (`n8n_node_workflows` ×10,647, pricing, tool_intelligence, workflow_encyclopedia) | ✅ Yes | Re-import via seed scripts. |
| Pinecone indexes (6) | ✅ Yes | Regenerable from MySQL — see milestone 2.4. Not separately backed up. |

### Rationale

- **RPO 12h, not 24h:** blueprints are real customer effort, so a full-day loss
  window is too generous; twice-daily backups halve the worst case at negligible
  cost. Sub-hour RPO would be over-engineering — Vyrade is not a high-frequency
  transactional system.
- **RTO 4h, not 2h:** self-hosted (Coolify/Hostinger) means no managed instant
  failover, and a human runs the restore runbook — possibly off-hours. The
  `mysqldump` restore itself is minutes, but 4h honestly accounts for detection
  + decision + off-hours response + validation, without requiring 24/7 on-call.

### Implications for the downstream milestones

- **2.3 (backup schedule):** cadence = **every 12 hours** (2×/day), scheduled at
  off-peak times (e.g. ~02:00 and ~14:00 server time). Must satisfy RPO ≤ 12h.
- **2.5 (retention):** **DECIDED** — keep **14 twelve-hourly (7 days) + 4 weekly
  (4 weeks)**. See the 2.5 section below.
- **2.7 / 2.8 (runbook + test):** the timed restore must complete comfortably
  under the 4h RTO — target restore execution **≤ 60 min**, leaving buffer for
  detection and validation. 2.8 records the actual wall-clock time and checks it
  against this 4h ceiling.

> These objectives are a floor, not a ceiling — they can be tightened later
> (e.g. RPO → 6h) if traffic or customer commitments grow, without re-architecting.

---

## 2.4 — Pinecone export / regeneration strategy (investigated 2026-07-29)

**Question:** are the MySQL tables in the 2.3 backup sufficient to regenerate all
6 Pinecone indexes, and what's the regeneration path?

### The 6 indexes and their source data (verified)

Each index's source was confirmed by matching the retrieval code's metadata
fields (`lib/services/retrieval.js`) + live vector counts (`npm run check:config`)
to the actual MySQL tables. **All source tables live in `vyrade_blueprint`**, so
they are covered by the 2.3 database backup.

| Pinecone index | Vectors | Source table (in `vyrade_blueprint`) | In backup? |
|---|---|---|---|
| Workflow examples (`WORKFLOW`) | 10,647 | `n8n_node_workflows` (via `mysql_id` → `WORKFLOW_JSON`) | ✅ |
| Node knowledge (primary, `PINECONE_INDEX`) | 87,950 | derived from `n8n_node_workflows` (individual node instances) | ✅ (see caveat) |
| Tools (`TOOL`) | 1,228 | `product_hunt` (name/tagline/category/api docs) | ✅ |
| MCP (`MCP`) | 12,246 | `mcp_so` (name/url/config_json/tags) | ✅ |
| Make modules (`MAKE`) | 34,938 | `make_all_nodes` (APP_/ACTION_ fields) | ✅ |
| Zapier apps (`ZAPIER`) | 9,804 | `zapier_nodes` (name/slug/premium flags) | ✅ |

**Data conclusion: YES.** Every index's source data is in the MySQL backup. If
Pinecone is lost, no source data is lost — the raw material to rebuild all 6
indexes is in the same `vyrade_blueprint` dump. Pinecone therefore does **not**
need to be separately backed up.

### ⚠️ Gap found: no regeneration TOOLING exists in this repo

The repo has **zero Pinecone-write code** — verified: no `.upsert(` call anywhere,
and no index-build script. `curate-workflows.mjs` writes a MySQL table
(`workflow_encyclopedia`), not Pinecone. The indexes were built by an **external
ingestion process that is not in this codebase.** So the milestone's "which
scripts, in what order" cannot point at scripts that exist here yet.

- Retrieval (read side) is fully in-repo and works.
- Ingestion (embed → upsert) is **absent** — the fallback is currently
  documented at the DATA level but is **not executable** until a regeneration
  script is written (or the original ingestion scripts are located).

### Regeneration path (once tooling exists)

The 6 indexes are **independent** — none depends on another — so ordering is
trivial. The only prerequisite is a restored MySQL + the Pinecone/OpenAI keys:

1. Restore `vyrade_blueprint` (milestone 2.8) — brings back all 6 source tables.
2. For each index, run its embed-and-upsert over the source table (any order /
   parallel), using **`text-embedding-3-large` (dim 3072)** to match the existing
   indexes, and writing the **same metadata fields** the retrieval code reads
   (e.g. `mysql_id` for workflows; `APP_NAME/ACTION_*` for Make; `config_json`
   for MCP; `name/slug/is_premium` for Zapier; `product_hunt_category/api_doc`
   for tools).
3. Verify with `npm run check:config` — each index's dimension + vector count
   should return to the numbers above.

> **Caveat — primary node index:** its 87,950 vectors most likely come from
> exploding `n8n_node_workflows` into individual node instances (≈10,647 workflows
> × ~8 nodes), but the exact original build recipe isn't in the repo, so the
> reconstruction for THIS index would need to be re-derived and validated against
> retrieval quality.

### Recommended next step (to actually close 2.4)

Build a `scripts/rebuild-pinecone.mjs` (one function per index) that performs the
embed+upsert above, so the fallback is **executable and tested**, not theoretical.
Until then, 2.4 is "data is safe, tooling is a known gap." This is a real build
task (embedding ~155k records has an OpenAI cost) — recommend scoping it as its
own item.

---

## 2.5 — Retention policy (decided 2026-07-29)

**Policy: keep 14 twelve-hourly backups (7 days) + 4 weekly backups (4 weeks).**

| Tier | Cadence | Copies kept | Window covered |
|---|---|---|---|
| Short-term | every 12h (from RPO) | **14** | last **7 days** at full granularity |
| Long-tail | weekly | **4** | last **~28 days** |

### Why

- **14 × 12-hourly** serves the common "restore to a few hours ago" case (bad
  deploy, accidental delete) at the RPO's granularity for a full week.
- **4 × weekly** serves the "we only just noticed" case — a subtle bad migration
  or slow corruption found days/weeks later — without paying to keep 12-hourly
  copies for a month.
- **No monthly/90-day tier:** overkill for a pre-beta app with no compliance
  retention requirement. Add it later if that changes (the 2.5 decision options
  included it as a documented alternative).

### How this must be configured in Coolify (2.3)

Coolify's native backup retention is a simple "number of backups to keep" per
schedule. To realise the two tiers, configure **two backup schedules on the same
MySQL resource**:

| Schedule | Frequency (cron) | Keep |
|---|---|---|
| A — short-term | every 12h (e.g. `0 2,14 * * *`) | **14** |
| B — weekly | weekly off-peak (e.g. `0 3 * * 0`) | **4** |

*If Coolify only allows one schedule per resource:* run schedule A (12-hourly,
keep 14) in Coolify and implement the weekly tier via an **S3 lifecycle rule** on
the bucket (transition/retain a weekly copy for 28 days), or a second small cron.
Either way the **stated policy above is the target** — 2.3's screenshot evidence
must show settings that add up to it, not a leftover default.

### Storage note

Each dump includes the large static catalog tables (`product_hunt` ~92k,
`make_all_nodes` ~34k, `mcp_so` ~14k, `zapier_nodes` ~9k, `n8n_node_workflows`
~10k). Compressed, 18 total copies is a few GB on S3/B2 — well within free/cheap
tiers. (Optional future optimisation: exclude the static catalog tables from the
frequent dumps since they rarely change — but keep the restore simple for now.)

---

## 2.6 — Coolify instance backup (decided 2026-07-29)

**Decision: Coolify's own config is NOT separately backed up.** The accepted
recovery path is **reinstall Coolify → recreate the app + MySQL resource →
restore the DB backup from 2.3.** For a single-app pre-beta deployment, backing
up Coolify's internals is over-investment; the irreplaceable data is the app DB,
which 2.3 covers.

### Required prerequisite — the Recovery Inventory (this is what makes Path B work)

The reinstall path only meets the 4h RTO if the app's **secrets and deploy
config** are captured **outside Coolify** (a password manager / secrets vault) —
otherwise recovery stalls recreating ~15 env vars from memory. Capture and keep
current:

**A. Environment variables** — the full list of names is in `.env.example`
(don't commit the VALUES; store them securely). Groups to capture:
- DB: `DB_HOST/PORT/USER/PASSWORD/NAME`
- Auth: `AUTH_SECRET`
- OpenAI: `OPENAI_API_KEY`, `OPENAI_MODEL`, `EMBEDDING_MODEL` (+ any `OPENAI_PRICE_*`)
- Pinecone: `PINECONE_API_KEY` + `PINECONE_INDEX` and the per-index keys/names
  (`PINECONE_WORKFLOW_*`, `PINECONE_TOOL_*`, `PINECONE_MCP_*`, `PINECONE_MAKE_*`,
  `PINECONE_ZAPIER_*`)
- Email: `SMTP_HOST/PORT/USER/PASS/FROM`
- Analytics: `NEXT_PUBLIC_MIXPANEL_TOKEN`, `ANALYTICS_ALLOW_PII`
- Monitoring: `NEXT_PUBLIC_SENTRY_DSN`/`SENTRY_DSN`, `SENTRY_ENV`, `SENTRY_AUTH_TOKEN`
- Infra/flags: `TRUST_PROXY=2`, `STRICT_RECOMMENDATION_BEFORE_EXPORT` (if set),
  `N8N_TEST_URL/API_KEY` (if used)

**B. Coolify app-resource config** (write these down):
- Git repo URL + branch (`main`), build pack, build cmd (`npm run build`),
  start cmd (`npm start` / `next start`), exposed port (3000), Node version.
- Domain + Cloudflare/SSL settings (and that the app sits behind Cloudflare →
  Nginx, hence `TRUST_PROXY=2`).

**C. Coolify MySQL-resource config:**
- MySQL version, database name (`vyrade_blueprint`), credentials.
- The two backup schedules + S3 destination + retention (from 2.3 / 2.5).

### Recovery outline (feeds the 2.7 runbook)

1. Fresh VPS → install Coolify.
2. Recreate the MySQL resource (from Inventory C) and the app resource (Inventory B).
3. Set env vars (Inventory A).
4. Restore the latest DB backup into the MySQL resource (per the 2.7 runbook).
5. Re-point DNS/Cloudflare; boot the app; validate.

> **Security:** the Recovery Inventory contains live secrets — store it in a
> password manager / vault, NEVER in this repo or any backup that isn't
> encrypted. `.env.example` (names only) stays the public reference.

---

## 2.7 — Restore runbook

Step-by-step restore of the latest backup into a **scratch** MySQL resource, and
validation against live. Do NOT restore over the live database. Target: complete
in ≤ 60 min (well inside the 4h RTO).

### Prerequisites
- Access to the S3-compatible bucket holding the Coolify backups (from 2.3).
- Coolify dashboard access.
- The `mysql` client (or run the import from inside the DB container).

### Step 1 — Spin up a scratch MySQL resource in Coolify
1. Coolify → **+ New → Database → MySQL** (same VPS is fine, or a separate one).
2. Use the **same MySQL major version** as production (avoids dump
   incompatibilities). Name it e.g. `vyrade-restore-test`.
3. Note its host/port/user/password (Coolify shows them on the resource page).

### Step 2 — Get the latest backup
1. In the S3 bucket, find the newest dump from schedule A (12-hourly), e.g.
   `vyrade_blueprint-YYYYMMDD-HHMM.sql.gz`.
2. Download it to the VPS (or wherever you'll run the client):
   ```bash
   # example with the aws cli or the S3 provider's cli
   aws s3 cp s3://<bucket>/<path>/vyrade_blueprint-YYYYMMDD-HHMM.sql.gz .
   ```

### Step 3 — Restore into the scratch resource
Coolify's backup is a gzipped `mysqldump`. Pipe it into the scratch DB:
```bash
# Create the target schema if the dump doesn't (Coolify dumps usually include it)
mysql -h <scratch_host> -P <scratch_port> -u <scratch_user> -p \
  -e "CREATE DATABASE IF NOT EXISTS vyrade_blueprint CHARACTER SET utf8mb4;"

# Import (zcat streams the gzip straight in)
zcat vyrade_blueprint-YYYYMMDD-HHMM.sql.gz | \
  mysql -h <scratch_host> -P <scratch_port> -u <scratch_user> -p vyrade_blueprint
```
*(If Coolify's UI exposes a one-click "Restore" for the resource, that works too —
this manual path is the reliable fallback.)*

### Step 4 — Validate against live (`npm run verify:restore`)
From the app repo, point the tool at both databases and run it:
```bash
# LIVE comes from your normal DB_* env; add the scratch as RESTORE_DB_*
RESTORE_DB_HOST=<scratch_host> RESTORE_DB_PORT=<scratch_port> \
RESTORE_DB_USER=<scratch_user> RESTORE_DB_PASSWORD=<scratch_pass> \
RESTORE_DB_NAME=vyrade_blueprint \
  npm run verify:restore
```
It prints an exact **row-count comparison per table** (live vs restored) plus a
primary-key-max check, and **exits non-zero on any mismatch**. A clean run looks
like:
```
✓ Restore verified: 21 tables, all row counts + PK maxima match live.
```
Save this output — it's the evidence for milestone 2.8. Small deltas in
high-write tables (`conversations`, `operational_events`) are expected if live
took writes since the backup; the static catalog tables and user data
(`automation_blueprints`, `users`, …) must match exactly.

### Step 5 — Tear down
Delete the scratch MySQL resource in Coolify once validated (unless you're
keeping it for the 2.8 boot test).

---

## 2.8 — Actual restore test

### Local rehearsal — PASSED (2026-07-29)

Before the real VPS test, the **entire restore mechanic was rehearsed locally**
against the live `vyrade_blueprint` (MySQL 8.4.3): `mysqldump` → fresh scratch
schema → import → `verify:restore` → `verify:schema`. This de-risks the real run
and proves the tooling. Evidence:

| Step | Result |
|---|---|
| Dump (`mysqldump --single-transaction`) | **9 s**, 411 MB uncompressed |
| Restore into scratch DB | **43 s** |
| **Total dump+restore** | **52 s** |
| `verify:restore` (row counts + PK maxima, all 21 tables vs live) | ✅ `181,020 / 181,020 rows match` |
| `verify:schema` on the restored DB (16 tables + critical columns/indexes) | ✅ passed → **app can boot against restored data** |

Interpretation vs. **RTO = 4h:** the data-movement core is **under a minute**
locally. Even with S3 download + a fresh Coolify resource + app reboot on the
VPS, the real restore has an enormous margin under 4h. (411 MB compresses to a
much smaller `.sql.gz` for the S3 transfer.)

### The REAL test — still required (pending 2.3)

The rehearsal proves the *mechanic*; the launch-gate test must use a genuine
**Coolify-produced backup pulled from S3** on the VPS. It cannot be done until
2.3 is live and has produced at least one backup. To perform it, follow the 2.7
runbook end-to-end and record:

- [ ] Which backup file (timestamp) was restored.
- [ ] Wall-clock time: S3 download + restore + app boot (vs. the 4h RTO).
- [ ] `npm run verify:restore` output (row-count parity with live).
- [ ] Confirmation the app booted and served a request against the scratch data.

Paste that evidence here to close 2.8.

---

## 2.9 — Document + schedule recurrence

### Restore Drill Log

Every drill (rehearsal or real) is recorded here with evidence. Append a row
each time — never overwrite.

| Date | Type | Backup restored | Dump/Restore time | Row-count parity | Boot OK? | RTO check (≤4h) | By |
|---|---|---|---|---|---|---|---|
| 2026-07-29 | Local rehearsal | live `vyrade_blueprint` (mysqldump) | 9s dump / 43s restore (411 MB) | ✅ 181,020 = 181,020 (21 tables) | ✅ schema intact | ✅ ~1 min core, huge margin | Salman |
| _pending_ | **Real (VPS)** | _Coolify S3 backup_ | | | | | |

> The **real VPS drill** is the launch-gate close for 2.8 — run it once 2.3 is
> live (see the 2.8 checklist) and add the row here.

### Recurrence — DECIDED

- **Cadence:** **quarterly** (minimum). Prod-data restore proven 4×/year.
- **Mechanism:** in-repo **GitHub Action** — `.github/workflows/restore-drill-reminder.yml`
  runs on cron `0 9 1 1,4,7,10 *` (1st of Jan/Apr/Jul/Oct) and auto-opens a
  tracking issue with the drill checklist. Version-controlled and owned in the
  repo — not dependent on a personal calendar. (`workflow_dispatch` allows an
  on-demand run.)
- **Owner:** Salman (runs the drill, records the row above, closes the issue).
- **Next due:** first **real** drill ASAP after 2.3 goes live; automated
  quarterly reminders continue thereafter.
- *(Optional supplement: a shared-calendar reminder on the same cadence — the
  GitHub issue is the system of record either way.)*

### Evidence for the client (2.9 "what to send back")

The quarterly recurrence is scheduled in-repo via the GitHub Action above — a
committed, auditable mechanism. Each firing produces a dated tracking issue; each
completed drill adds a row to the Drill Log with real evidence.
