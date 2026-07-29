/**
 * Post-migration schema verifier (pre-beta gate #2 — clean staging migration).
 *
 * Run AFTER `node scripts/migrate.js` against a database to confirm the
 * migration produced the schema the app expects: every table present, plus the
 * critical columns/indexes added by later migrations. Exits non-zero on any
 * missing object so it can gate a staging deploy.
 *
 *   Usage:  node scripts/verify-schema.js
 *   (reads the same DB_* env vars as migrate.js)
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

// Every table the app relies on (mirrors sql/*.sql).
const EXPECTED_TABLES = [
  'users', 'auth_attempts', 'auth_otps',
  'automation_blueprints', 'automation_blueprint_versions', 'automation_blueprint_events',
  'conversations', 'conversation_messages', 'blueprint_workflows',
  'pricing_sources', 'connector_cost_profiles',
  'workflow_encyclopedia', 'tool_intelligence', 'operational_events',
  'recommendation_runs', 'export_runs',
];

// Columns/indexes that arrived in later (tolerant) migrations — the ones most
// likely to be missing if a migration file didn't fully apply.
const EXPECTED_COLUMNS = {
  recommendation_runs: ['recommendation_hash', 'engine_version', 'monthly_runs'],
  export_runs: ['recommendation_id', 'recommended_platform', 'followed_recommendation', 'is_recommendation_override', 'override_reason'],
};
const EXPECTED_INDEXES = {
  recommendation_runs: ['idx_rec_hash', 'idx_rec_latest'],
  export_runs: ['idx_export_override'],
};

async function main() {
  const db = process.env.DB_NAME;
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: db,
  });
  const problems = [];

  const [tableRows] = await conn.query(
    'SELECT table_name AS t FROM information_schema.tables WHERE table_schema = ?', [db]
  );
  const present = new Set(tableRows.map((r) => r.t || r.T || r.table_name));
  for (const t of EXPECTED_TABLES) {
    if (!present.has(t)) problems.push(`missing table: ${t}`);
  }

  for (const [table, cols] of Object.entries(EXPECTED_COLUMNS)) {
    if (!present.has(table)) continue; // already reported as a missing table
    const [colRows] = await conn.query(
      'SELECT column_name AS c FROM information_schema.columns WHERE table_schema = ? AND table_name = ?', [db, table]
    );
    const have = new Set(colRows.map((r) => r.c || r.column_name));
    for (const c of cols) if (!have.has(c)) problems.push(`missing column: ${table}.${c}`);
  }

  for (const [table, idxs] of Object.entries(EXPECTED_INDEXES)) {
    if (!present.has(table)) continue;
    const [idxRows] = await conn.query('SHOW INDEX FROM `' + table + '`');
    const have = new Set(idxRows.map((r) => r.Key_name));
    for (const i of idxs) if (!have.has(i)) problems.push(`missing index: ${table}.${i}`);
  }

  await conn.end();

  if (problems.length) {
    console.error(`\n✗ Schema verification FAILED for "${db}" (${problems.length} issue(s)):`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`\n✓ Schema OK for "${db}": ${EXPECTED_TABLES.length} tables, all critical columns + indexes present.`);
  process.exit(0);
}

main().catch((err) => { console.error('Schema verification error:', err.message); process.exit(1); });
