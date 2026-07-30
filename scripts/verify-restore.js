/**
 * Restore verification (milestone 2.7 / evidence for 2.8).
 *
 * Compares a RESTORED scratch database against the LIVE database table-by-table
 * — exact row counts (not information_schema estimates) plus the max primary-key
 * value where there's a single integer PK — and prints a diff. Exits non-zero on
 * any mismatch, so a restore test can gate on it and capture the output as
 * evidence.
 *
 *   Live connection   : DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME
 *   Restored (scratch): RESTORE_DB_HOST / RESTORE_DB_PORT / RESTORE_DB_USER /
 *                       RESTORE_DB_PASSWORD / RESTORE_DB_NAME
 *   (each RESTORE_* falls back to its DB_* value, so a scratch DB on the SAME
 *    host only needs RESTORE_DB_NAME set.)
 *
 *   node scripts/verify-restore.js
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

function liveCfg() {
  return {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  };
}
function restoreCfg() {
  return {
    host: process.env.RESTORE_DB_HOST || process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.RESTORE_DB_PORT || process.env.DB_PORT || 3306),
    user: process.env.RESTORE_DB_USER || process.env.DB_USER,
    password: process.env.RESTORE_DB_PASSWORD ?? process.env.DB_PASSWORD,
    database: process.env.RESTORE_DB_NAME || process.env.DB_NAME,
  };
}

async function tableList(conn, db) {
  const [rows] = await conn.query(
    `SELECT table_name AS t FROM information_schema.tables
      WHERE table_schema = ? AND table_type = 'BASE TABLE' ORDER BY table_name`, [db]
  );
  return rows.map((r) => r.t || r.table_name);
}

// Single-column integer PK, if any (for a cheap content-drift signal via MAX).
async function intPkColumn(conn, db, table) {
  const [rows] = await conn.query(
    `SELECT k.column_name AS c, c.data_type AS d
       FROM information_schema.key_column_usage k
       JOIN information_schema.columns c
         ON c.table_schema = k.table_schema AND c.table_name = k.table_name AND c.column_name = k.column_name
      WHERE k.table_schema = ? AND k.table_name = ? AND k.constraint_name = 'PRIMARY'`, [db, table]
  );
  if (rows.length !== 1) return null; // composite or no PK → skip MAX check
  return /int|bigint|decimal/i.test(rows[0].d) ? (rows[0].c || rows[0].column_name) : null;
}

async function stats(conn, db, table) {
  const [[cnt]] = await conn.query(`SELECT COUNT(*) AS n FROM \`${db}\`.\`${table}\``);
  const pk = await intPkColumn(conn, db, table).catch(() => null);
  let max = null;
  if (pk) {
    const [[m]] = await conn.query(`SELECT MAX(\`${pk}\`) AS m FROM \`${db}\`.\`${table}\``);
    max = m.m;
  }
  return { count: Number(cnt.n), pk, max: max == null ? null : Number(max) };
}

async function main() {
  const live = liveCfg();
  const restored = restoreCfg();
  console.log(`LIVE     : ${live.user}@${live.host}:${live.port}/${live.database}`);
  console.log(`RESTORED : ${restored.user}@${restored.host}:${restored.port}/${restored.database}\n`);

  const liveConn = await mysql.createConnection(live);
  const resConn = await mysql.createConnection(restored);

  const liveTables = await tableList(liveConn, live.database);
  const resTables = new Set(await tableList(resConn, restored.database));

  const problems = [];
  let liveTotal = 0, resTotal = 0;
  console.log('table'.padEnd(34) + 'live'.padStart(10) + 'restored'.padStart(12) + '  status');
  console.log('-'.repeat(70));

  for (const t of liveTables) {
    if (!resTables.has(t)) { console.log(t.padEnd(34) + '—'.padStart(10) + 'MISSING'.padStart(12) + '  ✗'); problems.push(`${t}: missing in restore`); continue; }
    const [l, r] = await Promise.all([stats(liveConn, live.database, t), stats(resConn, restored.database, t)]);
    liveTotal += l.count; resTotal += r.count;
    const countOk = l.count === r.count;
    const maxOk = l.max == null || l.max === r.max;
    const ok = countOk && maxOk;
    if (!ok) problems.push(`${t}: live=${l.count}${l.pk ? `/max ${l.max}` : ''} vs restored=${r.count}${r.pk ? `/max ${r.max}` : ''}`);
    console.log(t.padEnd(34) + String(l.count).padStart(10) + String(r.count).padStart(12) + `  ${ok ? '✓' : '✗'}${!maxOk ? ' (max mismatch)' : ''}`);
  }
  // Tables present in restore but not live (unexpected extras).
  for (const t of resTables) if (!liveTables.includes(t)) problems.push(`${t}: extra table in restore (not in live)`);

  console.log('-'.repeat(70));
  console.log('TOTAL rows'.padEnd(34) + String(liveTotal).padStart(10) + String(resTotal).padStart(12));
  await liveConn.end(); await resConn.end();

  if (problems.length) {
    console.error(`\n✗ Restore verification FAILED — ${problems.length} issue(s):`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`\n✓ Restore verified: ${liveTables.length} tables, all row counts + PK maxima match live.`);
  process.exit(0);
}

main().catch((err) => { console.error('verify-restore error:', err.message); process.exit(1); });
