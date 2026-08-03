/**
 * Grant or revoke admin (milestone 3.2). No admin-management UI exists yet, so
 * this is how the first admin is created.
 *
 *   node scripts/set-admin.mjs <email>            # grant admin
 *   node scripts/set-admin.mjs <email> --revoke   # revoke admin
 *   node scripts/set-admin.mjs --list             # list current admins
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';

const cfg = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
};

async function main() {
  const args = process.argv.slice(2);
  const conn = await mysql.createConnection(cfg);

  if (args.includes('--list')) {
    const [rows] = await conn.query('SELECT email, is_admin FROM users WHERE is_admin = 1');
    console.log(rows.length ? 'Admins:\n' + rows.map((r) => '  - ' + r.email).join('\n') : 'No admins yet.');
    await conn.end();
    return;
  }

  const email = args.find((a) => !a.startsWith('--'));
  const revoke = args.includes('--revoke');
  if (!email) {
    console.error('Usage: node scripts/set-admin.mjs <email> [--revoke] | --list');
    process.exit(1);
  }

  const [res] = await conn.query('UPDATE users SET is_admin = ? WHERE email = ?', [revoke ? 0 : 1, email.toLowerCase()]);
  await conn.end();

  if (res.affectedRows === 0) {
    console.error(`✗ No user with email "${email}". (Register/verify that account first.)`);
    process.exit(1);
  }
  console.log(`✓ ${email} is ${revoke ? 'no longer an admin' : 'now an admin'}.`);
}

main().catch((err) => { console.error('set-admin error:', err.message); process.exit(1); });
