require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

// Errors we treat as "already applied" so re-running migrations is safe even
// on MySQL versions without ADD COLUMN / ADD INDEX ... IF NOT EXISTS.
const IGNORABLE = new Set([
  'ER_DUP_FIELDNAME',   // column already exists
  'ER_DUP_KEYNAME',     // index already exists
  'ER_TABLE_EXISTS_ERROR',
  'ER_FK_DUP_NAME',     // foreign key already exists
]);

// Split a SQL file into individual statements. Naive on purpose — our schema
// files use plain `;`-terminated statements with no stored routines.
function splitStatements(sql) {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function runFile(connection, file, { tolerant }) {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'sql', file), 'utf8');
  for (const statement of splitStatements(sql)) {
    try {
      await connection.query(statement);
    } catch (err) {
      if (tolerant && IGNORABLE.has(err.code)) {
        console.log(`  · skipped (${err.code}): ${statement.split('\n')[0]}…`);
        continue;
      }
      throw err;
    }
  }
  console.log(`Applied ${file}.`);
}

async function migrate() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true,
  });

  await runFile(connection, 'schema.sql', { tolerant: false });
  await runFile(connection, 'auth.sql', { tolerant: true });
  await runFile(connection, 'usage.sql', { tolerant: true });

  console.log('Migration applied successfully.');
  await connection.end();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
