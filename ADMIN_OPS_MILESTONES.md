3. Admin / Ops Dashboard
Why it matters: Right now there's no way to see what's actually happening across users without querying the DB directly. This is the operational visibility layer — the largest single item in this gate.
Estimated time: 5–7 days
Milestone
Detail
Est. time
3.1 Scope + wireframe
Confirm exact views needed: Blueprints list (with status/readiness), failed generations, import failures (workflow.meta.import_check), cost spikes (per-user token spend), rate-limit blocks (auth_attempts), recommendation overrides, missing pricing/tool data gaps (already surfaced by operationalInsightsRepository.js's docGaps()).
3–4 hrs
3.2 Admin auth gate
Add an is_admin flag (or role column) to users, and middleware/route guard restricting /admin/** to admin accounts only.
3–4 hrs
3.3 Blueprints overview page
Table of all Blueprints across users: status, readiness score, version, last activity, with search/filter.
1 day
3.4 Failures + import-check page
Surfaces failed workflow generations and import_check: failed results, pulling from existing export_runs / operational_events tables — much of the underlying data already exists, this is presentation.
1 day
3.5 Cost + usage page
Per-user token spend and cost trend (already tracked in conversations.total_cost_usd / conversation_messages.cost_usd), plus rate-limit block counts from auth_attempts.
1 day
3.6 Operational insights page
Surface docGaps() and topFailingNodes() (already built for the caution-retrieval learning loop) as an actual admin view, rather than only feeding generation silently.
4–6 hrs
3.7 Pagination, filters, CSV export
Make each view usable at scale (hundreds+ of Blueprints), not just a raw dump.
4–6 hrs
3.8 QA pass
Verify every admin view against a seeded test dataset with known-bad rows (a failed export, a blocked user, a cost spike) to confirm each surfaces correctly.
3–4 hrs

Dependency: Benefits from usage limits (#4) existing first, since the cost/usage page is more useful once there's a plan concept to compare against — but not strictly blocking.
