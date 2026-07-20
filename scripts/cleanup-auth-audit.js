/**
 * Apply the auth_attempts retention policy.
 *
 *   npm run cleanup:auth-audit
 *
 * Cron it daily in production, e.g.:
 *   0 3 * * *  cd /path/to/app && npm run cleanup:auth-audit >> /var/log/vyrade-audit.log 2>&1
 *
 * The app also prunes opportunistically (max once an hour), so this script is
 * belt-and-braces — useful for a deterministic schedule or a one-off backfill.
 *
 * Overrides (also honoured as env vars):
 *   --anonymize-after=30   strip email/ip after N days
 *   --retain=90            delete rows after N days
 */
require('dotenv').config();

const arg = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  const n = Number.parseInt(hit.split('=')[1], 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

(async () => {
  // The lib/* modules are ESM; import them dynamically from this CJS script.
  const { pruneAuthAttempts } = await import('../lib/services/authAuditRepository.js');
  const { pool } = await import('../lib/config/db.js');

  const overrides = {};
  const a = arg('anonymize-after');
  const r = arg('retain');
  if (a) overrides.anonymizeAfterDays = a;
  if (r) overrides.retainDays = r;

  const { anonymized, deleted, policy } = await pruneAuthAttempts(overrides);
  console.log(
    `auth_attempts retention applied — anonymized ${anonymized} row(s) older than ` +
    `${policy.anonymizeAfterDays}d, deleted ${deleted} row(s) older than ${policy.retainDays}d.`
  );
  await pool.end();
})().catch((err) => {
  console.error('Cleanup failed:', err.message);
  process.exit(1);
});
