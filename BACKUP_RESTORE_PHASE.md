# Backup + Restore Test (Launch Gate, Item #2) — Coolify/Hostinger Edition

**Why it matters:** A backup you've never restored from is a hope, not a backup. This item exists to convert "we probably have backups" into "we proved we can recover" — and it's the same standard we've held every other launch-gate item to.

**Hosting context:** Vyrade 2.0 deploys via **Coolify** on a **Hostinger VPS**. This is self-hosted, not a managed database provider (no PlanetScale/RDS-style automatic snapshots) — but Coolify has its own built-in scheduled backup feature per database resource, which does most of the heavy lifting here. Use it rather than hand-rolling a custom `mysqldump` + cron script from scratch.

**Estimated time: 1.5–2.5 days** (down slightly from the original estimate, since Coolify's native backup feature removes most of the automation work in 2.2).

---

| Milestone | Detail | Est. time |
|---|---|---|
| **2.1 Define RPO/RTO** | Decide acceptable data loss window (Recovery Point Objective — e.g., 24h) and acceptable downtime to recover (Recovery Time Objective — e.g., 2h). This shapes the backup frequency and retention chosen below. | 1–2 hrs |
| **2.2 Confirm MySQL is a Coolify-managed resource** | Before anything else: confirm the MySQL database is running as an actual **Coolify database resource** (not just a bare Docker container Coolify doesn't track as a "database"). If it's not currently set up that way, this needs to happen first — everything below assumes it is. | 1–2 hrs (verification, or a migration step if it isn't) |
| **2.3 Configure Coolify's native backup schedule** | In the MySQL resource's **Backups** tab: add an S3-compatible storage destination (AWS S3, Backblaze B2, Wasabi, or similar — pick one, Hostinger doesn't need to be the storage target), set a cron schedule matching the RPO from 2.1 (e.g., daily at an off-peak hour, or every 6–12h for a tighter RPO), and set retention (by count and/or age). Coolify runs the real `mysqldump` under the hood and pushes the compressed result to that destination automatically. | 2–3 hrs |
| **2.4 Pinecone export/regeneration strategy** | Unchanged by hosting choice — Pinecone is a separate managed service outside Coolify. Confirm whether the source MySQL tables that were embedded (the ones covered by the backup in 2.3) are sufficient to regenerate all 6 Pinecone indexes if needed, and document that regeneration path (which scripts, in what order) as the fallback — even if Pinecone itself isn't separately backed up. | 2–3 hrs |
| **2.5 Retention policy** | Confirm the retention settings chosen inside Coolify's backup config (2.3) actually match a stated policy — e.g., "7 daily + 4 weekly" — rather than just whatever the default was. Write it down explicitly so it's a decision, not an accident. | 1 hr |
| **2.6 Coolify instance backup (new — not in the original plan)** | Separate from the app's database: Coolify stores its own configuration on the host (`/data/coolify`). Decide whether recovering the *Coolify setup itself* on a fresh VPS is in scope for this item, or whether "reinstall Coolify + restore the DB backup from 2.3" is an acceptable recovery path for now. Either is fine — just make it an explicit decision, not an unstated assumption. | 1–2 hrs |
| **2.7 Restore runbook** | Written, step-by-step doc: how to spin up a scratch MySQL resource in Coolify (easy — same VPS or a separate one), restore the latest backup into it, and validate row counts/integrity against the live database. | 2–3 hrs |
| **2.8 Actual restore test — not optional** | Perform one real restore into the scratch resource from 2.7, verify the app can boot against the restored data, and time how long the whole process took — checked against the RTO from 2.1. This is the step that actually proves recovery works, not just that a backup file exists. | 3–4 hrs |
| **2.9 Document + schedule recurrence** | Record the successful restore test with a timestamp and evidence (row counts before/after, time taken), and schedule this as a recurring exercise — quarterly at minimum — rather than a one-time checkbox. | 1 hr |

**Dependency:** None — can run in parallel with any other launch-gate item.

---

## What to send back once done

For each milestone, the same standard as everything else on this project: real evidence, not a description.

- **2.3:** Screenshot of the Coolify Backups tab showing the schedule, destination, and retention settings configured.
- **2.4:** The actual documented regeneration path (which script(s), what order) — not just "yes it's possible."
- **2.8:** The restore test's actual output — row counts from the restored scratch DB compared to production, and the wall-clock time the restore took.
- **2.9:** Confirmation of where/how the quarterly recurrence is scheduled (calendar reminder, Coolify's own schedule, or otherwise).